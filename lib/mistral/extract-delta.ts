import type { Delta, EdgeType, Graph, GraphNode, SourceRef } from "../types.js";
import type { DeltaDraft } from "./models.js";
import { normalizeDeltaDraft } from "./normalize.js";
import { deltaDraftSchema } from "./schemas.js";
import { requestStructured } from "./structured.js";

const REPLY_EDGE_TYPES = new Set<EdgeType>([
  "MEMBER_OF",
  "OWNS",
  "DEPENDS_ON",
  "BLOCKS",
]);

function emptyDraft(): DeltaDraft {
  return { nodes: [], edges: [] };
}

function legalTeam(context: Graph): GraphNode | undefined {
  return context.nodes.find(
    (node) =>
      node.type === "Team" &&
      /\blegal\b/i.test(`${node.id} ${node.label} ${node.summary ?? ""}`),
  );
}

function relevantTask(text: string, context: Graph): GraphNode | undefined {
  const tasks = context.nodes.filter((node) => node.type === "Task");
  const lower = text.toLowerCase();
  return tasks
    .map((task) => {
      const tokens = task.label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const tokenScore = tokens.filter((token) => lower.includes(token)).length;
      const demoScore = /rollback|runbook/i.test(task.label) && /runbook|rollback/i.test(text) ? 10 : 0;
      return { task, score: demoScore + tokenScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.task.id.localeCompare(right.task.id))[0]
    ?.task;
}

function fallbackExtractDraft(text: string, context: Graph): DeltaDraft {
  const task = relevantTask(text, context);
  if (!task) return emptyDraft();

  const nodes: DeltaDraft["nodes"] = [];
  const edges: DeltaDraft["edges"] = [];
  const lower = text.normalize("NFKC").toLowerCase();

  const isDone = /\b(done|complete(?:d)?|finished|shipped)\b/i.test(lower);
  const isBlocked = /\b(blocked|stuck|waiting|never\s+(?:heard|got)|can['’]?t|cannot)\b/i.test(lower);
  if (isDone || isBlocked) {
    nodes.push({
      id: task.id,
      type: "Task",
      label: task.label,
      ...(isDone ? { status: "done" } : { status: "blocked" }),
    });
  }

  const legal = /\blegal\b/i.test(lower) ? legalTeam(context) : undefined;
  if (isBlocked && legal) {
    const existingBlocker = context.nodes.find(
      (node) =>
        node.type === "Blocker" &&
        (node.id === "blocker.waiting-on-legal" ||
          /waiting\s+(?:for|on)\s+legal/i.test(`${node.label} ${node.summary ?? ""}`)),
    );
    const blockerId = existingBlocker?.id ?? "blocker.waiting-on-legal";
    nodes.push({
      id: blockerId,
      type: "Blocker",
      label: existingBlocker?.label ?? "Waiting on Legal",
      status: "blocked",
      ...(task.teamId ? { teamId: task.teamId } : {}),
      summary: "Work is blocked while waiting for Legal to respond.",
    });
    edges.push({ from: blockerId, to: task.id, type: "BLOCKS" });

    const existingDependency = context.edges.find(
      (edge) =>
        edge.type === "DEPENDS_ON" &&
        edge.from === task.id &&
        edge.to === legal.id,
    );
    if (existingDependency || /never\s+got\s+back|waiting\s+(?:for|on)/i.test(lower)) {
      edges.push({ from: task.id, to: legal.id, type: "DEPENDS_ON" });
    }
  }

  return { nodes, edges };
}

function compactContext(context: Graph): object {
  return {
    nodes: context.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      ...(node.teamId ? { teamId: node.teamId } : {}),
      ...(node.status ? { status: node.status } : {}),
      ...(node.ownerId ? { ownerId: node.ownerId } : {}),
      ...(node.dueDate ? { dueDate: node.dueDate } : {}),
      ...(node.summary ? { summary: node.summary.slice(0, 240) } : {}),
    })),
    edges: context.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      ...(edge.note ? { note: edge.note.slice(0, 160) } : {}),
    })),
  };
}

export async function extractDelta(
  text: string,
  context: Graph,
  source: SourceRef,
): Promise<Delta> {
  const fallback = (): DeltaDraft => fallbackExtractDraft(text, context);
  const draft = await requestStructured({
    model: process.env.MISTRAL_LARGE_MODEL || "mistral-large-latest",
    system:
      "Extract only facts explicitly supported by the reply as node and edge drafts. Use an existing ID for each update, omit the ID only for a new entity, create no deletions, and invent no people, teams, dates, handles, or statuses.",
    user: JSON.stringify({ reply: text.slice(0, 8_000), context: compactContext(context) }),
    schemaName: "extract_delta",
    schema: deltaDraftSchema,
    fallback,
  });

  return normalizeDeltaDraft(draft, {
    context,
    source,
    allowedEdgeTypes: REPLY_EDGE_TYPES,
  });
}
