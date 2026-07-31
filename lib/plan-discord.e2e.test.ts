import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { Message } from 'discord.js';
import type { GraphApi } from '../bot/api';
import {
  dispatchPlanHandoffs,
  type PlanDispatchApi,
  type PlanRecipientDirectory,
} from '../bot/dispatch';
import { handleDmReply } from '../bot/flows';
import { buildHandoffManifest } from './handoff';
import { analysisToPlan, type DocumentAnalysis } from './planning';
import type { Delta, Graph, PlanDispatchReceipt } from './types';
import { parseGraph } from './validation';

const NOW = '2026-07-31T06:30:00.000Z';
const GUTS_DISCORD_ID = '123456789012345678';

function applyToMemory(graph: Graph, delta: Delta): Graph {
  const deletedNodes = new Set(delta.deleteNodeIds ?? []);
  const deletedEdges = new Set(delta.deleteEdgeIds ?? []);
  const nextNodes = new Map(
    graph.nodes.filter((node) => !deletedNodes.has(node.id)).map((node) => [node.id, node]),
  );
  const nextEdges = new Map(
    graph.edges
      .filter((edge) => !deletedEdges.has(edge.id) && !deletedNodes.has(edge.from) && !deletedNodes.has(edge.to))
      .map((edge) => [edge.id, edge]),
  );
  for (const node of delta.upsertNodes ?? []) nextNodes.set(node.id, node);
  for (const edge of delta.upsertEdges ?? []) nextEdges.set(edge.id, edge);
  return { nodes: [...nextNodes.values()], edges: [...nextEdges.values()] };
}

describe('AI plan -> Discord -> task progress', () => {
  it('generates GUTS work, resolves the exact Discord username, DMs once, and accepts DONE', async () => {
    const seed = parseGraph(JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'data/seed.json'), 'utf8'),
    ) as unknown);
    const guts = seed.nodes.find((node) => node.id === 'person.guts');
    assert.equal(guts?.label, 'GUTS');
    assert.equal(guts?.discordUserId, undefined, 'the fake roster should exercise exact-name linking');
    assert.equal(
      seed.nodes.filter((node) => node.type === 'Task' && node.ownerId === guts?.id).length,
      2,
    );

    // This is the structured output produced by the AI analysis stage. Keeping
    // the boundary deterministic makes the integration test stable and avoids
    // calling an external model while still exercising the real plan builder.
    const analysis: DocumentAnalysis = {
      summary: 'GUTS validates plan delivery and the Discord completion loop.',
      departments: ['Product'],
      people: [],
      todos: [
        {
          title: 'Run AI plan to Discord smoke test',
          description: 'Confirm the generated plan arrives as one private handoff.',
          department: 'Product',
          assignee: 'GUTS',
          status: 'not_started',
          dueDate: '2026-08-01',
          dependencies: [],
          quote: 'GUTS owns Run AI plan to Discord smoke test.',
          sourceName: 'guts-e2e.md',
        },
        {
          title: 'Verify Discord completion updates',
          description: 'Reply DONE and verify that the graph task advances.',
          department: 'Product',
          assignee: 'GUTS',
          status: 'not_started',
          dueDate: '2026-08-01',
          dependencies: ['Run AI plan to Discord smoke test'],
          quote: 'GUTS owns Verify Discord completion updates.',
          sourceName: 'guts-e2e.md',
        },
      ],
      conflicts: [],
      clarificationQuestions: [],
    };

    const { delta, plan } = analysisToPlan(seed, analysis, 'guts-e2e.md');
    let graph = applyToMemory(seed, delta);
    assert.equal(plan.assignments.length, 2);
    assert.deepEqual(new Set(plan.assignments.map((item) => item.owner)), new Set(['GUTS']));

    const receipts: PlanDispatchReceipt[] = [];
    const sentMessages: string[] = [];
    const api: PlanDispatchApi = {
      async getPlanHandoff() {
        return buildHandoffManifest(plan, graph, receipts);
      },
      async linkDiscordIdentity(personId, discordUserId) {
        graph = {
          ...graph,
          nodes: graph.nodes.map((node) => node.id === personId
            ? { ...node, discordUserId, updatedAt: NOW }
            : node),
        };
      },
      async postPlanDispatchReceipt(receipt) {
        const saved = { ...receipt, updatedAt: NOW };
        const index = receipts.findIndex((item) => item.ownerKey === saved.ownerKey);
        if (index >= 0) receipts[index] = saved;
        else receipts.push(saved);
        return saved;
      },
    };
    const directory: PlanRecipientDirectory = {
      async fetchById() {
        throw new Error('GUTS starts without a linked Discord id');
      },
      async findExact(displayName) {
        assert.equal(displayName, 'GUTS');
        return {
          id: GUTS_DISCORD_ID,
          async send(message) {
            sentMessages.push(message);
            return { id: 'discord-dm-guts-1' };
          },
        };
      },
    };

    const firstDispatch = await dispatchPlanHandoffs(directory, api);
    assert.deepEqual(firstDispatch, {
      planId: plan.id,
      sent: 1,
      unmatched: 0,
      failed: 0,
      skipped: 0,
    });
    assert.equal(sentMessages.length, 1, 'GUTS receives one grouped private message');
    assert.match(sentMessages[0] ?? '', /Run AI plan to Discord smoke test/);
    assert.match(sentMessages[0] ?? '', /Verify Discord completion updates/);
    assert.match(sentMessages[0] ?? '', /Reply with DONE:/);
    assert.equal(
      graph.nodes.find((node) => node.id === 'person.guts')?.discordUserId,
      GUTS_DISCORD_ID,
    );
    assert.equal(receipts[0]?.status, 'sent');
    assert.equal(receipts[0]?.messageId, 'discord-dm-guts-1');

    const secondDispatch = await dispatchPlanHandoffs(directory, api);
    assert.equal(secondDispatch.sent, 0);
    assert.equal(secondDispatch.skipped, 1);
    assert.equal(sentMessages.length, 1, 'the saved receipt prevents a duplicate DM');

    const botReplies: string[] = [];
    const reply = 'DONE: Run AI plan to Discord smoke test';
    const replyApi = {
      async getPersonSubgraph(discordUserId: string) {
        assert.equal(discordUserId, GUTS_DISCORD_ID);
        return graph;
      },
      async postDelta(progress: Delta) {
        graph = applyToMemory(graph, progress);
        return {
          ok: true,
          changed: [
            ...(progress.upsertNodes ?? []).map((node) => node.id),
            ...(progress.upsertEdges ?? []).map((edge) => edge.id),
          ],
        };
      },
    } as unknown as GraphApi;
    const discordReply = {
      id: 'discord-reply-guts-1',
      content: reply,
      author: { id: GUTS_DISCORD_ID },
      async reply(message: string) {
        botReplies.push(message);
      },
    } as unknown as Message;

    await handleDmReply(discordReply, replyApi);
    const advancedTask = graph.nodes.find(
      (node) => node.id === 'task.guts-plan-dispatch-test',
    );
    assert.equal(advancedTask?.status, 'done');
    assert.equal(advancedTask?.sourceRef?.kind, 'discord_dm');
    assert.equal(advancedTask?.sourceRef?.ref, 'discord-reply-guts-1');
    assert.match(botReplies[0] ?? '', /updated the project graph/);
  });
});
