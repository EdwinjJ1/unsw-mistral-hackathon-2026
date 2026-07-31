import type { Graph, GraphNode, NodeType, Status, TeamDetail } from './types';

const STATUS_RANK: Record<Status, number> = {
  blocked: 0,
  at_risk: 1,
  in_progress: 2,
  not_started: 3,
  done: 4,
};

export function deriveTeamDetail(graph: Graph, teamId: string): TeamDetail | null {
  const team = graph.nodes.find((node) => node.id === teamId && node.type === 'Team');
  if (!team) return null;
  const ofType = (type: NodeType) =>
    graph.nodes.filter((node) => node.type === type && node.teamId === teamId);
  const ids = new Set([
    teamId,
    ...graph.nodes.filter((node) => node.teamId === teamId).map((node) => node.id),
  ]);

  return {
    team,
    members: ofType('Person'),
    tasks: ofType('Task').sort(
      (a, b) =>
        STATUS_RANK[a.status ?? 'not_started'] - STATUS_RANK[b.status ?? 'not_started'] ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    ),
    blockers: ofType('Blocker'),
    conflicts: graph.edges.filter(
      (edge) => edge.type === 'CONFLICTS_WITH' && (ids.has(edge.from) || ids.has(edge.to)),
    ),
    dependencies: graph.edges.filter(
      (edge) =>
        edge.type === 'DEPENDS_ON' && ids.has(edge.from) !== ids.has(edge.to),
    ),
  };
}

export function claimOf(graph: Graph, nodeId: string) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  const owner = node?.ownerId
    ? graph.nodes.find((item) => item.id === node.ownerId)
    : undefined;
  const team = node?.teamId
    ? graph.nodes.find((item) => item.id === node.teamId)
    : node?.type === 'Team'
      ? node
      : undefined;
  return {
    node,
    who: owner?.label ?? team?.label ?? 'Unattributed',
    quote: node?.sourceRef?.quote,
    source: node?.sourceRef,
    at: node?.updatedAt,
  };
}

export function normalizeTeamDetail(detail: TeamDetail): TeamDetail {
  return {
    team: detail.team,
    members: detail.members ?? [],
    tasks: detail.tasks ?? [],
    blockers: detail.blockers ?? [],
    conflicts: detail.conflicts ?? [],
    dependencies: detail.dependencies ?? [],
  };
}

export function teamForNode(graph: Graph, nodeId: string): GraphNode | undefined {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  if (node.type === 'Team') return node;
  return graph.nodes.find((item) => item.id === node.teamId && item.type === 'Team');
}

export function applyDelta(graph: Graph, delta: import('./types').Delta): Graph {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const id of delta.deleteNodeIds ?? []) nodeMap.delete(id);
  for (const id of delta.deleteEdgeIds ?? []) edgeMap.delete(id);
  for (const node of delta.upsertNodes ?? []) nodeMap.set(node.id, node);
  for (const edge of delta.upsertEdges ?? []) edgeMap.set(edge.id, edge);
  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}

export function graphKpis(graph: Graph) {
  return {
    teams: graph.nodes.filter((node) => node.type === 'Team').length,
    openTasks: graph.nodes.filter(
      (node) => node.type === 'Task' && node.status !== 'done',
    ).length,
    blockers: graph.nodes.filter(
      (node) => node.type === 'Blocker' && node.status === 'blocked',
    ).length,
    contradictions: graph.edges.filter((edge) => edge.type === 'CONFLICTS_WITH').length,
  };
}
