import type { Delta, Graph, GraphEdge, SourceRef } from './types';
import { edgeId, nodeId } from './types';

/*
 * Track E integration seam.
 *
 * When Track E lands, replace the two exports at the bottom with:
 * export { generateGraphFromText, findContradictions } from './mistral';
 *
 * Routes deliberately import this bridge so the HTTP and persistence layers do
 * not change when the real Mistral implementation replaces these fallbacks.
 */

function stableFingerprint(text: string): string {
  let hash = 2_166_136_261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

async function fallbackGenerateGraphFromText(text: string): Promise<Delta> {
  const now = new Date().toISOString();
  const fingerprint = stableFingerprint(text);
  const quote = text.replace(/\s+/g, ' ').trim().slice(0, 240);
  const sourceRef: SourceRef = {
    kind: 'document',
    ref: `fallback-import/${fingerprint}`,
    quote,
  };
  const teamId = nodeId('Team', 'Imported Notes');
  const personId = nodeId('Person', 'Import Owner');
  const taskLabel = `Review imported note ${fingerprint}`;
  const taskId = nodeId('Task', taskLabel);

  return {
    upsertNodes: [
      {
        id: teamId,
        type: 'Team',
        label: 'Imported Notes',
        status: 'in_progress',
        updatedAt: now,
        sourceRef,
      },
      {
        id: personId,
        type: 'Person',
        label: 'Import Owner',
        teamId,
        status: 'not_started',
        updatedAt: now,
        sourceRef,
      },
      {
        id: taskId,
        type: 'Task',
        label: taskLabel,
        teamId,
        ownerId: personId,
        status: 'not_started',
        summary: quote,
        updatedAt: now,
        sourceRef,
      },
    ],
    upsertEdges: [
      {
        id: edgeId(personId, 'MEMBER_OF', teamId),
        from: personId,
        to: teamId,
        type: 'MEMBER_OF',
        updatedAt: now,
        sourceRef,
      },
      {
        id: edgeId(personId, 'OWNS', taskId),
        from: personId,
        to: taskId,
        type: 'OWNS',
        updatedAt: now,
        sourceRef,
      },
    ],
  };
}

async function fallbackFindContradictions(
  graph: Graph,
  changedIds: string[],
): Promise<GraphEdge[]> {
  const changed = new Set(changedIds);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const conflicts: GraphEdge[] = [];

  for (const blockEdge of graph.edges) {
    if (blockEdge.type !== 'BLOCKS') continue;
    const blocker = nodeById.get(blockEdge.from);
    const blockedTask = nodeById.get(blockEdge.to);
    if (
      blockedTask?.type !== 'Task'
      || blockedTask.status !== 'done'
      || blocker?.status === 'done'
      || (!changed.has(blockedTask.id) && !changed.has(blocker?.id ?? ''))
    ) {
      continue;
    }

    const id = edgeId(blockEdge.from, 'CONFLICTS_WITH', blockEdge.to);
    conflicts.push({
      id,
      from: blockEdge.from,
      to: blockEdge.to,
      type: 'CONFLICTS_WITH',
      note: `${blockedTask.label} is marked done while ${blocker?.label ?? blockEdge.from} still blocks it.`,
      updatedAt: new Date().toISOString(),
      sourceRef: blockedTask.sourceRef ?? blocker?.sourceRef,
    });
  }

  return conflicts;
}

export const generateGraphFromText = fallbackGenerateGraphFromText;
export const findContradictions = fallbackFindContradictions;
