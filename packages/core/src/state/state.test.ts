import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertJobTransition,
  assertStageTransition,
  JOB_TRANSITIONS,
  STAGE_TRANSITIONS,
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
