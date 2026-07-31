import { nodeId, type Delta, type EdgeType, type Graph, type GraphNode, type SourceRef } from "../types";
import type { DeltaDraft } from "./models";
import { normalizeDeltaDraft } from "./normalize";
import { deltaDraftSchema } from "./schemas";
import { requestStructured } from "./structured";

const REPLY_EDGE_TYPES = new Set<EdgeType>([
  "MEMBER_OF",
  "OWNS",
  "DEPENDS_ON",
  "BLOCKS",
]);

function emptyDraft(): DeltaDraft {
  return { nodes: [], edges: [] };
}

const GENERIC_TOKENS = new Set([
  "the", "and", "for", "with", "team", "task", "new", "old", "all",
]);

function significantTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));
}

function mentionedTeam(text: string, context: Graph): GraphNode | undefined {
  const textTokens = new Set(significantTokens(text.normalize("NFKC")));
  return context.nodes.find(
    (node) =>
      node.type === "Team" &&
      significantTokens(`${node.id} ${node.label}`).some((token) =>
        textTokens.has(token),
      ),
  );
}

function relevantTask(text: string, context: Graph): GraphNode | undefined {
  const tasks = context.nodes.filter((node) => node.type === "Task");
  const textTokens = new Set(significantTokens(text.normalize("NFKC")));
  return tasks
    .map((task) => {
      const tokens = significantTokens(task.label);
      return { task, score: tokens.filter((token) => textTokens.has(token)).length };
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

  const waitedOnTeam = isBlocked ? mentionedTeam(text, context) : undefined;
  if (isBlocked && waitedOnTeam) {
    const blockerLabel = `Waiting on ${waitedOnTeam.label}`;
    const waitPattern = new RegExp(
      `waiting\\s+(?:for|on)\\s+${waitedOnTeam.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    const existingBlocker = context.nodes.find(
      (node) =>
        node.type === "Blocker" &&
        (nodeId("Blocker", node.label) === nodeId("Blocker", blockerLabel) ||
          waitPattern.test(`${node.label} ${node.summary ?? ""}`)),
    );
    const blockerId = existingBlocker?.id ?? nodeId("Blocker", blockerLabel);
    nodes.push({
      id: blockerId,
      type: "Blocker",
      label: existingBlocker?.label ?? blockerLabel,
      status: "blocked",
      ...(task.teamId ? { teamId: task.teamId } : {}),
      summary: `Work is blocked while waiting for ${waitedOnTeam.label} to respond.`,
    });
    edges.push({ from: blockerId, to: task.id, type: "BLOCKS" });

    const existingDependency = context.edges.find((edge) => {
      if (edge.type !== "DEPENDS_ON" || edge.from !== task.id) return false;
      const target = context.nodes.find((node) => node.id === edge.to);
      return edge.to === waitedOnTeam.id || target?.teamId === waitedOnTeam.id;
    });
    if (existingDependency) {
      edges.push({
        from: task.id,
        to: existingDependency.to,
        type: "DEPENDS_ON",
        ...(existingDependency.note ? { note: existingDependency.note } : {}),
      });
    } else if (/never\s+got\s+back|waiting\s+(?:for|on)/i.test(lower)) {
      edges.push({ from: task.id, to: waitedOnTeam.id, type: "DEPENDS_ON" });
    }
  }

  return { nodes, edges };
}

function anchorReplyDraft(
  draft: DeltaDraft,
  text: string,
  context: Graph,
): DeltaDraft {
  const task = relevantTask(text, context);
  if (!task) return draft;

  const blockerRefs = new Set<string>();
  for (const node of [
    ...context.nodes.filter((candidate) => candidate.type === "Blocker"),
    ...draft.nodes.filter((candidate) => candidate.type === "Blocker"),
  ]) {
    if (node.id) blockerRefs.add(node.id);
    blockerRefs.add(node.label);
    blockerRefs.add(nodeId("Blocker", node.label));
  }

  return {
    nodes: draft.nodes.map((node) => ({ ...node })),
    edges: draft.edges.map((edge) =>
      edge.type === "BLOCKS" && blockerRefs.has(edge.from)
        ? { ...edge, to: task.id }
        : { ...edge },
    ),
  };
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

  // The model draft is authoritative; the deterministic draft only steps in
  // when the model (or the offline fallback path) produced nothing usable.
  const groundedDraft =
    draft.nodes.length > 0 || draft.edges.length > 0
      ? anchorReplyDraft(draft, text, context)
      : fallback();

  return normalizeDeltaDraft(groundedDraft, {
    context,
    source,
    allowedEdgeTypes: REPLY_EDGE_TYPES,
  });
}
