import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHandoffManifest } from './handoff';
import type { DeliveryPlan, Graph, PlanDispatchReceipt } from './types';

const NOW = '2026-07-31T06:00:00.000Z';
const plan: DeliveryPlan = {
  id: 'plan.test',
  generatedAt: NOW,
  sourceName: 'meeting.md',
  summary: 'Launch preparation.',
  assignments: [
    {
      taskId: 'task.runbook',
      title: 'Publish rollback runbook',
      departmentId: 'team.engineering',
      department: 'Engineering',
      ownerId: 'person.priya',
      owner: 'Priya',
      status: 'in_progress',
      dueDate: '2026-08-01',
      dependencyTaskIds: ['task.retention'],
    },
    {
      taskId: 'task.dashboard',
      title: 'Finish launch dashboard',
      departmentId: 'team.engineering',
      department: 'Engineering',
      ownerId: 'person.priya',
      owner: 'Priya',
      status: 'not_started',
      dependencyTaskIds: [],
    },
    {
      taskId: 'task.retention',
      title: 'Confirm retention',
      departmentId: 'team.legal',
      department: 'Legal',
      owner: 'Needs confirmation',
      status: 'not_started',
      dependencyTaskIds: [],
    },
  ],
  clarificationQuestions: ['“Confirm retention”这部分是谁的 work？'],
  bot: { channel: 'discord', ready: true, instructions: 'Send grouped handoffs.' },
};

const graph: Graph = {
  nodes: [
    {
      id: 'person.priya',
      type: 'Person',
      label: 'Priya Shah',
      teamId: 'team.engineering',
      discordUserId: '123456789012345678',
      updatedAt: NOW,
    },
  ],
  edges: [],
};

describe('buildHandoffManifest', () => {
  it('groups work by owner and enriches a newly linked Discord identity', () => {
    const manifest = buildHandoffManifest(plan, graph, []);
    assert.equal(manifest.handoffs.length, 2);
    assert.equal(manifest.handoffs[0]?.assignments.length, 2);
    assert.equal(manifest.handoffs[0]?.owner, 'Priya Shah');
    assert.equal(manifest.handoffs[0]?.discordUserId, '123456789012345678');
    assert.match(manifest.handoffs[0]?.message ?? '', /When: 2026-08-01/);
    assert.match(manifest.handoffs[0]?.message ?? '', /Depends on: Confirm retention/);
    assert.equal(manifest.counts.ready, 1);
    assert.equal(manifest.counts.recipients, 1);
    assert.equal(manifest.counts.missingIdentity, 0);
    assert.equal(manifest.counts.unassigned, 1);
  });

  it('uses a sent receipt to make repeat dispatch idempotent', () => {
    const receipt: PlanDispatchReceipt = {
      planId: plan.id,
      ownerKey: 'person.priya',
      ownerId: 'person.priya',
      owner: 'Priya Shah',
      discordUserId: '123456789012345678',
      status: 'sent',
      messageId: 'discord-message-1',
      updatedAt: NOW,
    };
    const manifest = buildHandoffManifest(plan, graph, [receipt]);
    assert.equal(manifest.handoffs[0]?.status, 'sent');
    assert.equal(manifest.handoffs[0]?.messageId, 'discord-message-1');
    assert.equal(manifest.counts.ready, 0);
    assert.equal(manifest.counts.sent, 1);
  });
});
