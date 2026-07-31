import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeDb, resetDb } from './db';
import { applyDelta, getGraph, getPersonSubgraph, getTeamDetail } from './graph';
import type { Delta, GraphNode } from './types';
import { edgeId } from './types';

const NOW = '2026-07-31T06:00:00.000Z';
let testDirectory = '';

function node(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'label'>): GraphNode {
  return {
    updatedAt: NOW,
    sourceRef: { kind: 'seed', ref: `test/${overrides.id}` },
    ...overrides,
  };
}

beforeEach(() => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-graph-test-'));
  process.env.DATABASE_PATH = path.join(testDirectory, 'test.db');
  resetDb();
});

afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('applyDelta', () => {
  it('is idempotent and preserves omitted optional fields', () => {
    const initial: Delta = {
      upsertNodes: [
        node({
          id: 'task.rollback-runbook',
          type: 'Task',
          label: 'Rollback runbook',
          status: 'in_progress',
          summary: 'Keep this summary.',
          ownerId: 'person.alex',
        }),
      ],
    };

    applyDelta(initial);
    applyDelta(initial);
    applyDelta({
      upsertNodes: [
        node({
          id: 'task.rollback-runbook',
          type: 'Task',
          label: 'Rollback runbook',
          status: 'done',
          updatedAt: '2026-07-31T07:00:00.000Z',
          sourceRef: undefined,
        }),
      ],
    });

    const graph = getGraph();
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0]?.status, 'done');
    assert.equal(graph.nodes[0]?.summary, 'Keep this summary.');
    assert.equal(graph.nodes[0]?.ownerId, 'person.alex');
    assert.deepEqual(graph.nodes[0]?.sourceRef, {
      kind: 'seed',
      ref: 'test/task.rollback-runbook',
    });
  });

  it('deletes incident edges with a deleted node', () => {
    const person = node({ id: 'person.alex', type: 'Person', label: 'Alex' });
    const task = node({ id: 'task.auth', type: 'Task', label: 'Auth' });
    const ownershipId = edgeId(person.id, 'OWNS', task.id);
    applyDelta({
      upsertNodes: [person, task],
      upsertEdges: [
        {
          id: ownershipId,
          from: person.id,
          to: task.id,
          type: 'OWNS',
          updatedAt: NOW,
        },
      ],
    });

    const result = applyDelta({ deleteNodeIds: [task.id] });
    assert.deepEqual(new Set(result.changed), new Set([task.id, ownershipId]));
    assert.equal(getGraph().edges.length, 0);
  });
});

describe('graph queries', () => {
  it('returns cross-team dependencies in team detail', () => {
    applyDelta({
      upsertNodes: [
        node({ id: 'team.engineering', type: 'Team', label: 'Engineering' }),
        node({ id: 'team.legal', type: 'Team', label: 'Legal' }),
        node({
          id: 'task.runbook',
          type: 'Task',
          label: 'Runbook',
          teamId: 'team.engineering',
        }),
        node({
          id: 'task.retention',
          type: 'Task',
          label: 'Retention',
          teamId: 'team.legal',
        }),
      ],
      upsertEdges: [
        {
          id: edgeId('task.runbook', 'DEPENDS_ON', 'task.retention'),
          from: 'task.runbook',
          to: 'task.retention',
          type: 'DEPENDS_ON',
          updatedAt: NOW,
        },
      ],
    });

    const detail = getTeamDetail('team.engineering');
    assert.ok(detail);
    assert.equal(detail.dependencies.length, 1);
    assert.equal(detail.dependencies[0]?.to, 'task.retention');
  });

  it('includes the dependency owner and team in a person subgraph', () => {
    applyDelta({
      upsertNodes: [
        node({ id: 'team.engineering', type: 'Team', label: 'Engineering' }),
        node({ id: 'team.legal', type: 'Team', label: 'Legal' }),
        node({
          id: 'person.alex',
          type: 'Person',
          label: 'Alex',
          teamId: 'team.engineering',
          discordUserId: 'discord-alex',
        }),
        node({
          id: 'person.jordan',
          type: 'Person',
          label: 'Jordan',
          teamId: 'team.legal',
        }),
        node({
          id: 'task.runbook',
          type: 'Task',
          label: 'Runbook',
          teamId: 'team.engineering',
          ownerId: 'person.alex',
        }),
        node({
          id: 'task.retention',
          type: 'Task',
          label: 'Retention',
          teamId: 'team.legal',
          ownerId: 'person.jordan',
        }),
      ],
      upsertEdges: [
        {
          id: edgeId('task.runbook', 'DEPENDS_ON', 'task.retention'),
          from: 'task.runbook',
          to: 'task.retention',
          type: 'DEPENDS_ON',
          updatedAt: NOW,
        },
        {
          id: edgeId('person.jordan', 'OWNS', 'task.retention'),
          from: 'person.jordan',
          to: 'task.retention',
          type: 'OWNS',
          updatedAt: NOW,
        },
      ],
    });

    const subgraph = getPersonSubgraph('discord-alex');
    const ids = new Set(subgraph.nodes.map((item) => item.id));
    assert.ok(ids.has('person.alex'));
    assert.ok(ids.has('task.runbook'));
    assert.ok(ids.has('task.retention'));
    assert.ok(ids.has('person.jordan'));
    assert.ok(ids.has('team.legal'));
  });
});
