import type {
  Delta,
  EdgeType,
  Graph,
  GraphEdge,
  GraphNode,
  NodeType,
  SourceRef,
} from "../types.js";
import type { DeltaDraft, DeltaNodeDraft } from "./models.js";

interface NormalizeOptions {
  context?: Graph;
  source: SourceRef;
  inputText?: string;
  allowedEdgeTypes?: ReadonlySet<EdgeType>;
}

function defined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

export function kebab(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unnamed";
}

export function makeNodeId(type: NodeType, label: string): string {
  return `${type.toLowerCase()}.${kebab(label)}`;
}

export function makeEdgeId(
  from: string,
  type: EdgeType,
  to: string,
): string {
  if (type === "CONFLICTS_WITH") {
    const [left, right] = [from, to].sort();
    return `${left}--${type}--${right}`;
  }
  return `${from}--${type}--${to}`;
}

export function cloneSourceRef(source: SourceRef): SourceRef {
  return {
    kind: source.kind,
    ref: source.ref,
    ...(source.quote !== undefined ? { quote: source.quote } : {}),
  };
}

export function conciseSummary(value: string): string | undefined {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (!singleLine) return undefined;
  const sentences = singleLine.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [singleLine];
  return (
    sentences
      .slice(0, 2)
      .map((sentence) => sentence.trim())
      .join(" ")
      .slice(0, 320) || undefined
  );
}

export function oneLineNote(value: string): string | undefined {
  const line = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return line ? line.slice(0, 240) : undefined;
}

export function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function sourceForDraft(
  source: SourceRef,
  evidenceQuote: string | null | undefined,
  inputText: string | undefined,
): SourceRef {
  const cloned = cloneSourceRef(source);
  if (
    source.kind === "document" &&
    evidenceQuote &&
    inputText?.includes(evidenceQuote)
  ) {
    return { ...cloned, quote: evidenceQuote };
  }
  return cloned;
}

function findSemanticExisting(
  draft: DeltaNodeDraft,
  contextNodes: readonly GraphNode[],
): GraphNode | undefined {
  if (draft.id) {
    const exact = contextNodes.find(
      (node) => node.id === draft.id && node.type === draft.type,
    );
    if (exact) return exact;
  }

  const labelKey = kebab(draft.label);
  return contextNodes.find(
    (node) => node.type === draft.type && kebab(node.label) === labelKey,
  );
}

function cloneNode(node: GraphNode): GraphNode {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    ...(node.teamId !== undefined ? { teamId: node.teamId } : {}),
    ...(node.status !== undefined ? { status: node.status } : {}),
    ...(node.summary !== undefined ? { summary: node.summary } : {}),
    ...(node.ownerId !== undefined ? { ownerId: node.ownerId } : {}),
    ...(node.dueDate !== undefined ? { dueDate: node.dueDate } : {}),
    ...(node.discordUserId !== undefined
      ? { discordUserId: node.discordUserId }
      : {}),
    updatedAt: node.updatedAt,
    ...(node.sourceRef ? { sourceRef: cloneSourceRef(node.sourceRef) } : {}),
  };
}

export function cloneEdge(edge: GraphEdge): GraphEdge {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    ...(edge.note !== undefined ? { note: edge.note } : {}),
    updatedAt: edge.updatedAt,
    ...(edge.sourceRef ? { sourceRef: cloneSourceRef(edge.sourceRef) } : {}),
  };
}

export function normalizeDeltaDraft(
  draft: DeltaDraft,
  options: NormalizeOptions,
): Delta {
  const contextNodes = options.context?.nodes ?? [];
  const contextIds = new Set(contextNodes.map((node) => node.id));
  const now = new Date().toISOString();
  const referenceMap = new Map<string, string>();
  const plans: Array<{
    draft: DeltaNodeDraft;
    existing?: GraphNode;
    id: string;
  }> = [];

  for (const nodeDraft of draft.nodes) {
    if (!nodeDraft.label.trim()) continue;
    const existing = findSemanticExisting(nodeDraft, contextNodes);
    const id = existing?.id ?? makeNodeId(nodeDraft.type, nodeDraft.label);
    plans.push({
      draft: nodeDraft,
      id,
      ...(existing ? { existing } : {}),
    });
    referenceMap.set(id, id);
    referenceMap.set(nodeDraft.label, id);
    referenceMap.set(makeNodeId(nodeDraft.type, nodeDraft.label), id);
    if (nodeDraft.id) referenceMap.set(nodeDraft.id, id);
  }

  for (const node of contextNodes) {
    referenceMap.set(node.id, node.id);
    referenceMap.set(node.label, node.id);
    referenceMap.set(makeNodeId(node.type, node.label), node.id);
  }

  const upsertNodeMap = new Map<string, GraphNode>();
  for (const plan of plans) {
    const previous = upsertNodeMap.get(plan.id);
    const base: GraphNode = previous
      ? cloneNode(previous)
      : plan.existing
        ? cloneNode(plan.existing)
        : {
            id: plan.id,
            type: plan.draft.type,
            label: plan.draft.label.trim(),
            updatedAt: now,
          };

    const teamId = defined(plan.draft.teamId)
      ? referenceMap.get(plan.draft.teamId)
      : undefined;
    const ownerId = defined(plan.draft.ownerId)
      ? referenceMap.get(plan.draft.ownerId)
      : undefined;
    const summary = defined(plan.draft.summary)
      ? conciseSummary(plan.draft.summary)
      : undefined;

    const normalized: GraphNode = {
      ...base,
      id: plan.id,
      type: plan.draft.type,
      label: plan.existing?.label ?? previous?.label ?? plan.draft.label.trim(),
      ...(teamId ? { teamId } : {}),
      ...(defined(plan.draft.status) ? { status: plan.draft.status } : {}),
      ...(summary ? { summary } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(defined(plan.draft.dueDate) && validIsoDate(plan.draft.dueDate)
        ? { dueDate: plan.draft.dueDate }
        : {}),
      updatedAt: now,
      sourceRef: sourceForDraft(
        options.source,
        plan.draft.evidenceQuote,
        options.inputText,
      ),
    };
    upsertNodeMap.set(normalized.id, normalized);
    contextIds.add(normalized.id);
  }

  const upsertEdgeMap = new Map<string, GraphEdge>();
  for (const edgeDraft of draft.edges) {
    if (
      options.allowedEdgeTypes &&
      !options.allowedEdgeTypes.has(edgeDraft.type)
    ) {
      continue;
    }

    let from = referenceMap.get(edgeDraft.from);
    let to = referenceMap.get(edgeDraft.to);
    if (!from || !to || !contextIds.has(from) || !contextIds.has(to)) continue;

    if (edgeDraft.type === "CONFLICTS_WITH") {
      if (from.localeCompare(to) > 0) {
        const previousFrom = from;
        from = to;
        to = previousFrom;
      }
    }
    if (from === to) continue;

    const id = makeEdgeId(from, edgeDraft.type, to);
    const note = defined(edgeDraft.note)
      ? oneLineNote(edgeDraft.note)
      : undefined;
    upsertEdgeMap.set(id, {
      id,
      from,
      to,
      type: edgeDraft.type,
      ...(note ? { note } : {}),
      updatedAt: now,
      sourceRef: sourceForDraft(
        options.source,
        edgeDraft.evidenceQuote,
        options.inputText,
      ),
    });
  }

  const nodes = [...upsertNodeMap.values()];
  const edges = [...upsertEdgeMap.values()];
  return {
    ...(nodes.length ? { upsertNodes: nodes } : {}),
    ...(edges.length ? { upsertEdges: edges } : {}),
  };
}
