import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  detectBlockedDependencies,
  detectContradictions,
  detectOrphans,
  detectOverdueTasks,
  detectSignals,
  detectSilentOwners,
  detectStaleFacts,
  detectUnownedTasks,
} from './signals.ts';

const NOW = new Date('2026-07-31T06:00:00.000Z');

function graph(nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>> = []) {
  return { nodes, edges } as never;
}

function node(
  id: string,
  type: 'Team' | 'Person' | 'Task' | 'Decision' | 'Blocker',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    label: id
      .split('.')
      .at(-1)!
      .split('-')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' '),
    updatedAt: '2026-07-31T05:00:00.000Z',
    ...overrides,
  };
}

function edge(
  from: string,
  type: 'MEMBER_OF' | 'OWNS' | 'DEPENDS_ON' | 'BLOCKS' | 'CONFLICTS_WITH',
  to: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `${from}--${type}--${to}`,
    from,
    to,
    type,
    updatedAt: '2026-07-31T05:00:00.000Z',
    ...overrides,
  };
}

test('detectContradictions returns valid conflicts and ignores dangling edges', () => {
  const input = graph(
    [node('task.alpha', 'Task'), node('task.beta', 'Task')],
    [
      edge('task.alpha', 'CONFLICTS_WITH', 'task.beta', {
        note: 'The two teams disagree',
      }),
      edge('task.alpha', 'CONFLICTS_WITH', 'task.missing'),
    ],
  );

  assert.deepEqual(detectContradictions(input), [
    {
      severity: 'critical',
      title: 'Alpha conflicts with Beta',
      why: 'The two teams disagree.',
      nodeIds: ['task.alpha', 'task.beta'],
    },
  ]);
});

test('detectBlockedDependencies only reports tasks waiting on valid blocked nodes', () => {
  const input = graph(
    [
      node('task.deploy', 'Task'),
      node('task.security-review', 'Task', { status: 'blocked' }),
      node('task.copy-review', 'Task', { status: 'in_progress' }),
    ],
    [
      edge('task.deploy', 'DEPENDS_ON', 'task.security-review'),
      edge('task.deploy', 'DEPENDS_ON', 'task.copy-review'),
      edge('task.deploy', 'DEPENDS_ON', 'task.missing'),
    ],
  );

  assert.deepEqual(detectBlockedDependencies(input), [
    {
      severity: 'critical',
      title: 'Deploy is waiting on blocked work',
      why: 'Deploy cannot proceed because Security Review is blocked.',
      nodeIds: ['task.deploy', 'task.security-review'],
    },
  ]);
});

test('detectUnownedTasks requires a valid Person-to-Task OWNS edge', () => {
  const input = graph(
    [
      node('person.owner', 'Person'),
      node('task.owned', 'Task'),
      node('task.unowned', 'Task'),
    ],
    [
      edge('person.owner', 'OWNS', 'task.owned'),
      edge('task.missing', 'OWNS', 'task.unowned'),
    ],
  );

  assert.deepEqual(
    detectUnownedTasks(input).map((signal) => signal.nodeIds),
    [['task.unowned']],
  );
});

test('detectStaleFacts uses a strict threshold and skips people and malformed dates', () => {
  const input = graph([
    node('task.old', 'Task', { updatedAt: '2026-07-30T05:59:59.999Z' }),
    node('task.boundary', 'Task', {
      updatedAt: '2026-07-30T06:00:00.000Z',
    }),
    node('person.old', 'Person', {
      updatedAt: '2026-07-29T00:00:00.000Z',
    }),
    node('decision.invalid', 'Decision', { updatedAt: 'not-a-date' }),
  ]);

  assert.deepEqual(
    detectStaleFacts(input, NOW, 24).map((signal) => signal.nodeIds),
    [['task.old']],
  );
});

test('detectOverdueTasks excludes due-today, done, recent, and malformed tasks', () => {
  const input = graph([
    node('task.overdue', 'Task', {
      status: 'in_progress',
      dueDate: '2026-07-30',
      updatedAt: '2026-07-29T05:00:00.000Z',
    }),
    node('task.due-today', 'Task', {
      status: 'in_progress',
      dueDate: '2026-07-31',
      updatedAt: '2026-07-29T05:00:00.000Z',
    }),
    node('task.done', 'Task', {
      status: 'done',
      dueDate: '2026-07-30',
      updatedAt: '2026-07-29T05:00:00.000Z',
    }),
    node('task.recent', 'Task', {
      status: 'in_progress',
      dueDate: '2026-07-30',
      updatedAt: '2026-07-31T05:30:00.000Z',
    }),
    node('task.invalid-date', 'Task', {
      status: 'in_progress',
      dueDate: '2026-02-30',
      updatedAt: '2026-07-29T05:00:00.000Z',
    }),
  ]);

  assert.deepEqual(
    detectOverdueTasks(input, NOW, 24).map((signal) => signal.nodeIds),
    [['task.overdue']],
  );
});

test('detectOrphans reports empty teams and tasks without a valid team', () => {
  const input = graph([
    node('team.populated', 'Team'),
    node('team.empty', 'Team'),
    node('task.valid', 'Task', { teamId: 'team.populated' }),
    node('task.missing-team', 'Task'),
    node('task.invalid-team', 'Task', { teamId: 'team.unknown' }),
  ]);

  assert.deepEqual(
    detectOrphans(input)
      .map((signal) => signal.nodeIds[0])
      .sort(),
    ['task.invalid-team', 'task.missing-team', 'team.empty'],
  );
});

test('detectSilentOwners requires all owned task timestamps to be valid and old', () => {
  const input = graph(
    [
      node('person.silent', 'Person'),
      node('person.active', 'Person'),
      node('person.unknown', 'Person'),
      node('person.no-work', 'Person'),
      node('task.old', 'Task', {
        updatedAt: '2026-07-29T05:00:00.000Z',
      }),
      node('task.recent', 'Task', {
        updatedAt: '2026-07-31T05:00:00.000Z',
      }),
      node('task.invalid', 'Task', { updatedAt: 'not-a-date' }),
    ],
    [
      edge('person.silent', 'OWNS', 'task.old'),
      edge('person.active', 'OWNS', 'task.old'),
      edge('person.active', 'OWNS', 'task.recent'),
      edge('person.unknown', 'OWNS', 'task.invalid'),
    ],
  );

  assert.deepEqual(
    detectSilentOwners(input, NOW, 48).map((signal) => signal.nodeIds),
    [['person.silent', 'task.old']],
  );
});

test('combined seed ranks hidden signals and surfaces the planted anomalies', () => {
  const seed = JSON.parse(
    readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'),
  );
  const signals = detectSignals(seed, NOW);

  assert.equal(signals[0].severity, 'critical');
  assert.match(signals[0].title, /conflicts with/);
  assert.equal(signals[1].severity, 'critical');
  assert.match(signals[1].title, /waiting on blocked work/);
  assert.ok(signals.length >= 8);
  assert.ok(signals.some((signal) => signal.title.endsWith('has no owner')));
  assert.ok(signals.some((signal) => signal.title.endsWith('is going stale')));
  assert.ok(
    signals.some((signal) => signal.title.endsWith('is not attached to a team')),
  );
  assert.ok(
    signals.some((signal) => signal.title.endsWith("'s work has gone quiet")),
  );
});

test('detectSignals does not mutate its input graph', () => {
  const input = graph(
    [
      node('person.owner', 'Person'),
      node('task.blocked', 'Task', { status: 'blocked' }),
      node('task.dependent', 'Task'),
    ],
    [
      edge('person.owner', 'OWNS', 'task.dependent'),
      edge('task.dependent', 'DEPENDS_ON', 'task.blocked'),
    ],
  );
  const before = structuredClone(input);

  detectSignals(input, NOW);

  assert.deepEqual(input, before);
});
