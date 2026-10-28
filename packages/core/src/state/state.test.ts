import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertJobTransition,
  assertStageTransition,
  JOB_TRANSITIONS,
  isPreRenderGate,
  NonRetryableError,
  postRenderGates,
  recordFailedStage,
  STAGE_TRANSITIONS,
  toFailedPayload,
  type JobStatus,
  type StageStatus,
} from './index.ts';

test('every legal job transition passes', () => {
  for (const [from, tos] of Object.entries(JOB_TRANSITIONS)) {
    for (const to of tos) {
      assert.doesNotThrow(() => assertJobTransition(from as JobStatus, to as JobStatus));
    }
  }
});

test('every illegal job transition throws', () => {
  const allStates = Object.keys(JOB_TRANSITIONS);
  for (const from of allStates) {
    for (const to of allStates) {
      if (JOB_TRANSITIONS[from].includes(to)) continue;
      assert.throws(() => assertJobTransition(from as JobStatus, to as JobStatus));
    }
  }
});

test('awaiting_review:<gate> is treated as the awaiting_review family', () => {
  assert.doesNotThrow(() => assertJobTransition('running', 'awaiting_review:image-quality'));
  assert.doesNotThrow(() => assertJobTransition('awaiting_review:seo', 'running'));
  assert.throws(() => assertJobTransition('published', 'awaiting_review:seo'));
  assert.doesNotThrow(() => assertJobTransition('awaiting_review:seo', 'queued'));
  assert.doesNotThrow(() =>
    assertJobTransition('awaiting_review:seo', 'awaiting_review:image-quality'),
  );
});

test('every legal stage transition passes', () => {
  for (const [from, tos] of Object.entries(STAGE_TRANSITIONS)) {
    for (const to of tos) {
      assert.doesNotThrow(() => assertStageTransition(from as StageStatus, to as StageStatus));
    }
  }
});

test('every illegal stage transition throws', () => {
  const allStates = Object.keys(STAGE_TRANSITIONS) as StageStatus[];
  for (const from of allStates) {
    for (const to of allStates) {
      if (STAGE_TRANSITIONS[from].includes(to)) continue;
      assert.throws(() => assertStageTransition(from, to));
    }
  }
});

test('toFailedPayload: plain errors are retryable and fall back to the given stage', () => {
  assert.deepEqual(toFailedPayload(new Error('network down'), 'render'), {
    stage: 'render',
    error: 'network down',
    retryable: true,
  });
});

test('toFailedPayload: errors with retryable=false are not retried', () => {
  const payload = toFailedPayload(new NonRetryableError('bad manifest'), 'run-job');
  assert.equal(payload.retryable, false);
  assert.equal(payload.error, 'bad manifest');
});

test('toFailedPayload: the stage recorded by the runner wins over the fallback', () => {
  const err = new Error('qa said no');
  recordFailedStage(err, 'qa');
  recordFailedStage(err, 'outer');
  assert.equal(toFailedPayload(err, 'run-job').stage, 'qa');
});

test('assets_review is the only pre-render gate; postRenderGates keeps the rest in order', () => {
  assert.equal(isPreRenderGate('assets_review'), true);
  assert.equal(isPreRenderGate('final_review'), false);
  assert.deepEqual(postRenderGates(['assets_review', 'final_review', 'seo']), [
    'final_review',
    'seo',
  ]);
  assert.deepEqual(postRenderGates(['assets_review']), []);
});
