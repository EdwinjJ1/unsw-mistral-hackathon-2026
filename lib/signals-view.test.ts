import assert from 'node:assert/strict';
import test from 'node:test';

import { getContradictionSources } from './signals-view.ts';

test('getContradictionSources presents both source quotes in edge order', () => {
  const graph = {
    nodes: [
      {
        id: 'task.engineering',
        type: 'Task',
        label: 'Engineering',
        updatedAt: '2026-07-31T05:00:00.000Z',
        sourceRef: {
          kind: 'discord_dm',
          ref: 'message-1',
          quote: 'Authentication shipped.',
        },
      },
      {
        id: 'task.ops',
        type: 'Task',
        label: 'Ops',
        updatedAt: '2026-07-31T05:00:00.000Z',
        sourceRef: {
          kind: 'discord_dm',
          ref: 'message-2',
          quote: 'Authentication is still blocking us.',
        },
      },
    ],
    edges: [
      {
        id: 'task.engineering--CONFLICTS_WITH--task.ops',
        from: 'task.engineering',
        to: 'task.ops',
        type: 'CONFLICTS_WITH',
        updatedAt: '2026-07-31T05:00:00.000Z',
      },
    ],
  };

  assert.deepEqual(
    getContradictionSources(
      {
        severity: 'critical',
        title: 'Engineering conflicts with Ops',
        why: 'The teams disagree.',
        nodeIds: ['task.engineering', 'task.ops'],
      },
      graph as never,
    ),
    [
      {
        nodeId: 'task.engineering',
        label: 'Engineering',
        quote: 'Authentication shipped.',
      },
      {
        nodeId: 'task.ops',
        label: 'Ops',
        quote: 'Authentication is still blocking us.',
      },
    ],
  );
});

test('getContradictionSources uses a readable fallback for missing evidence', () => {
  const graph = {
    nodes: [
      {
        id: 'task.alpha',
        type: 'Task',
        label: 'Alpha',
        updatedAt: '2026-07-31T05:00:00.000Z',
      },
      {
        id: 'task.beta',
        type: 'Task',
        label: 'Beta',
        updatedAt: '2026-07-31T05:00:00.000Z',
        sourceRef: {
          kind: 'seed',
          ref: 'beta',
          quote: 'Beta has evidence.',
        },
      },
    ],
    edges: [
      {
        id: 'task.alpha--CONFLICTS_WITH--task.beta',
        from: 'task.alpha',
        to: 'task.beta',
        type: 'CONFLICTS_WITH',
        updatedAt: '2026-07-31T05:00:00.000Z',
      },
    ],
  };

  assert.equal(
    getContradictionSources(
      {
        severity: 'critical',
        title: 'Alpha conflicts with Beta',
        why: 'The tasks disagree.',
        nodeIds: ['task.alpha', 'task.beta'],
      },
      graph as never,
    )[0].quote,
    'Source quote unavailable',
  );
});

test('getContradictionSources ignores non-contradiction signals', () => {
  assert.deepEqual(
    getContradictionSources(
      {
        severity: 'high',
        title: 'Unowned',
        why: 'Nobody owns it.',
        nodeIds: ['task.unowned'],
      },
      { nodes: [], edges: [] } as never,
    ),
    [],
  );
});
