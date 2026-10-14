-- Real bug found in P2.8's first genuine end-to-end `ss run-job` run
-- against a live Postgres, not caught by any test until now: the original
-- `unique (job_id, stage_name, output_id)` constraint in
-- 20260918_engine_core.sql never actually enforced uniqueness for
-- single-output stages (assets, tts — anything with no manifest-output
-- loop), because SQL's `NULL <> NULL` means two rows with `output_id IS
-- NULL` never conflict with each other. `JobStagesRepo.recordStart()`'s and
-- `recordEnd()`'s `.upsert(..., {onConflict: 'job_id,stage_name,output_id'})`
-- therefore silently INSERTed a fresh row on every call instead of updating
-- one in place — confirmed against the live job created this pass: two rows
-- each for the `assets` and `tts` stages (one stale `running`, one real
-- `done`), where exactly one was expected.
--
-- This was invisible in every test before now because the in-memory fake
-- store (packages/core/src/runner/runner.test.ts) and this repo's own JS
-- code already treat "no output" as the string `''`, not `null`, wherever
-- outputs get keyed (see StageRunner.run()'s `${stage.name}:${outputId ?? ''}`)
-- — only the real Postgres constraint's NULL semantics exposed the gap.
--
-- Fix: make `output_id` NOT NULL with a `''` default, matching the
-- convention the JS side already uses everywhere else. `''` compares equal
-- to `''`, so the *existing* unique constraint starts working correctly
-- with no redefinition needed — just backfilling.

-- Dedupe first: for every (job_id, stage_name) group of existing
-- output_id-IS-NULL rows, keep only the most recently updated one (the
-- real `done`/`failed` record `recordEnd` wrote) before the NOT NULL
-- backfill would otherwise collide two rows onto the same `''` value.
delete from job_stages
where id in (
  select id from (
    select id, row_number() over (
      partition by job_id, stage_name
      order by updated_at desc, id desc
    ) as rn
    from job_stages
    where output_id is null
  ) ranked
  where rn > 1
);

update job_stages set output_id = '' where output_id is null;
alter table job_stages alter column output_id set default '';
alter table job_stages alter column output_id set not null;
