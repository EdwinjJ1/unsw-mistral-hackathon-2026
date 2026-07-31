import type { Graph, GraphEdge, GraphNode } from "../types";
import type { ConflictDraft } from "./models";
import {
  makeEdgeId,
  oneLineNote,
} from "./normalize";
import { selectContradictionCandidates } from "./graph-context";
import { contradictionsSchema } from "./schemas";
import { requestStructured } from "./structured";

const GENERIC_TOKENS = new Set([
  "the", "and", "for", "with", "team", "task", "work", "all", "are",
  "waiting", "blocked", "approvals", "approval", "cleared", "approved",
  "decision", "done", "complete", "completed", "resolved", "pending",
]);

function significantTokens(node: GraphNode): Set<string> {
  return new Set(
    `${node.id.replace(/^[a-z]+\./, "").replaceAll("-", " ")} ${node.label} ${node.summary ?? ""}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)),
  );
}

function sharesSubject(left: GraphNode, right: GraphNode): boolean {
  const rightTokens = significantTokens(right);
  return [...significantTokens(left)].some((token) => rightTokens.has(token));
}

/*
 * Deterministic safety net: a Blocker that says work is waiting on something
 * contradicts a Decision that records the same subject as cleared/approved.
 * Purely lexical so it works offline for any team or subject, not just the
 * demo's Legal scenario.
 */
function fallbackConflicts(
  graph: Graph,
  candidates: readonly GraphNode[],
  anchorIds: ReadonlySet<string>,
): ConflictDraft[] {
  const blockers = candidates.filter(
    (node) =>
      node.type === "Blocker" &&
      /\b(wait(?:ing)?|blocked|unresponsive|no\s+response|never\s+(?:heard|got))\b/i.test(
        `${node.label} ${node.summary ?? ""}`,
      ),
  );
  const decisions = candidates.filter(
    (node) =>
      node.type === "Decision" &&
      /\b(cleared|approved|complete(?:d)?|resolved|done|signed\s+off)\b/i.test(
        `${node.label} ${node.summary ?? ""}`,
      ),
  );

  const conflicts: ConflictDraft[] = [];
  for (const blocker of blockers) {
    for (const decision of decisions) {
      if (
        (anchorIds.has(blocker.id) || anchorIds.has(decision.id)) &&
        sharesSubject(blocker, decision)
      ) {
        conflicts.push({
          from: blocker.id,
          to: decision.id,
          note: `Work is reported as blocked ("${blocker.label}"), while a recorded decision says otherwise ("${decision.label}").`,
        });
      }
    }
  }
  return conflicts;
}

function normalizeConflicts(
  graph: Graph,
  drafts: readonly ConflictDraft[],
  candidateIds: ReadonlySet<string>,
  anchorIds: ReadonlySet<string>,
): GraphEdge[] {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const existingPairs = new Set(
    graph.edges
      .filter((edge) => edge.type === "CONFLICTS_WITH")
      .map((edge) => {
        const [from, to] = [edge.from, edge.to].sort();
        return `${from}\u0000${to}`;
      }),
  );
  const output = new Map<string, GraphEdge>();
  const now = new Date().toISOString();

  for (const draft of drafts) {
    if (
      draft.from === draft.to ||
      !graphNodeIds.has(draft.from) ||
      !graphNodeIds.has(draft.to) ||
      !candidateIds.has(draft.from) ||
      !candidateIds.has(draft.to) ||
      (!anchorIds.has(draft.from) && !anchorIds.has(draft.to))
    ) {
      continue;
    }

    const fromNode = nodeById.get(draft.from);
    const toNode = nodeById.get(draft.to);
    if (!fromNode || !toNode || (fromNode.type === "Team" && toNode.type === "Team")) {
      continue;
    }

    const sorted = [draft.from, draft.to].sort();
    const from = sorted[0];
    const to = sorted[1];
    if (!from || !to) continue;
    const pairKey = `${from}\u0000${to}`;
    if (existingPairs.has(pairKey)) continue;

    const note = oneLineNote(draft.note);
    if (!note) continue;
    const id = makeEdgeId(from, "CONFLICTS_WITH", to);
    output.set(id, {
      id,
      from,
      to,
      type: "CONFLICTS_WITH",
      note,
      updatedAt: now,
    });
  }

  return [...output.values()];
}

function compactCandidates(nodes: readonly GraphNode[]): object[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: node.label,
    ...(node.teamId ? { teamId: node.teamId } : {}),
    ...(node.status ? { status: node.status } : {}),
    ...(node.summary ? { summary: node.summary.slice(0, 260) } : {}),
  }));
}

function compactCandidateEdges(
  graph: Graph,
  candidateIds: ReadonlySet<string>,
): object[] {
  return graph.edges
    .filter(
      (edge) =>
        edge.type !== "CONFLICTS_WITH" &&
        candidateIds.has(edge.from) &&
        candidateIds.has(edge.to),
    )
    .slice(0, 96)
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      ...(edge.note ? { note: edge.note.slice(0, 180) } : {}),
    }));
}

export async function findContradictions(
  graph: Graph,
  changedIds: string[],
): Promise<GraphEdge[]> {
  const { nodes, anchorIds } = selectContradictionCandidates(graph, changedIds);
  if (nodes.length < 2 || anchorIds.size === 0) return [];

  const fallback = (): { conflicts: ConflictDraft[] } => ({
    conflicts: fallbackConflicts(graph, nodes, anchorIds),
  });
  const candidateIds = new Set(nodes.map((node) => node.id));
  const result = await requestStructured({
    model: process.env.MISTRAL_LARGE_MODEL || "mistral-large-latest",
    system:
      "Return only direct factual contradictions among the supplied existing node IDs, with a one-line note. Reject uncertainty, missing information, scope differences, stale-but-compatible facts, and ordinary dependencies.",
    user: JSON.stringify({
      changedOrDirectlyRelatedIds: [...anchorIds],
      candidates: compactCandidates(nodes),
      relationships: compactCandidateEdges(graph, candidateIds),
    }),
    schemaName: "find_contradictions",
    schema: contradictionsSchema,
    fallback,
  });

  // Trust the model's conflicts when it found any (normalizeConflicts still
  // rejects invalid pairs); the lexical fallback is only a recall backstop.
  return normalizeConflicts(
    graph,
    result.conflicts.length > 0 ? result.conflicts : fallback().conflicts,
    candidateIds,
    anchorIds,
  );
}
