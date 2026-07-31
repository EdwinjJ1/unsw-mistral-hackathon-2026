import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlanDispatchReceipt, PlanHandoffManifest } from '../lib/types';
import { dispatchPlanHandoffs, type PlanDispatchApi, type PlanRecipientDirectory } from './dispatch';

const manifest = (status: 'pending' | 'sent' | 'unmatched' | 'failed'): PlanHandoffManifest => ({
  planId: 'plan.test',
  generatedAt: '2026-07-31T06:00:00.000Z',
  sourceName: 'meeting.md',
  summary: 'Launch work.',
  clarificationQuestions: [],
  handoffs: [{
    ownerKey: 'person.priya',
    ownerId: 'person.priya',
    owner: 'Priya',
    department: 'Engineering',
    assignments: [{
      taskId: 'task.runbook',
      title: 'Publish runbook',
      department: 'Engineering',
      ownerId: 'person.priya',
      owner: 'Priya',
      status: 'in_progress',
      dueDate: '2026-08-01',
      dependencyTaskIds: [],
    }],
    message: 'Publish the runbook by 2026-08-01.',
    status,
  }],
  counts: {
    assignments: 1,
    recipients: 1,
    ready: status === 'sent' ? 0 : 1,
    missingIdentity: 1,
    unassigned: 0,
    sent: status === 'sent' ? 1 : 0,
    failed: status === 'failed' ? 1 : 0,
  },
});

function apiFor(
  value: PlanHandoffManifest,
  receipts: Array<Omit<PlanDispatchReceipt, 'updatedAt'>>,
  links: string[],
): PlanDispatchApi {
  return {
    getPlanHandoff: async () => value,
    linkDiscordIdentity: async (_personId, discordUserId) => { links.push(discordUserId); },
    postPlanDispatchReceipt: async (receipt) => {
      receipts.push(receipt);
      return { ...receipt, updatedAt: '2026-07-31T06:00:00.000Z' };
    },
  };
}

describe('dispatchPlanHandoffs', () => {
  it('never resends a handoff with a sent receipt', async () => {
    let sends = 0;
    const directory: PlanRecipientDirectory = {
      fetchById: async () => { throw new Error('should not fetch'); },
      findExact: async () => ({ id: '123456789012345678', send: async () => {
        sends += 1;
        return { id: 'message.1' };
      } }),
    };
    const result = await dispatchPlanHandoffs(directory, apiFor(manifest('sent'), [], []));
    assert.equal(result.skipped, 1);
    assert.equal(sends, 0);
  });

  it('retries an unmatched handoff after an exact identity becomes available', async () => {
    const receipts: Array<Omit<PlanDispatchReceipt, 'updatedAt'>> = [];
    const links: string[] = [];
    const directory: PlanRecipientDirectory = {
      fetchById: async () => { throw new Error('no stored id'); },
      findExact: async () => ({
        id: '123456789012345678',
        send: async () => ({ id: 'message.1' }),
      }),
    };
    const result = await dispatchPlanHandoffs(
      directory,
      apiFor(manifest('unmatched'), receipts, links),
    );
    assert.equal(result.sent, 1);
    assert.deepEqual(links, ['123456789012345678']);
    assert.equal(receipts[0]?.status, 'sent');
    assert.equal(receipts[0]?.messageId, 'message.1');
  });
});
