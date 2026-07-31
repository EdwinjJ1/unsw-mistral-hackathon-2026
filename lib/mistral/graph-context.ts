import type { Graph, GraphEdge, GraphNode } from "../types.js";

export interface AssignmentFact {
  task: GraphNode;
  blockers: GraphNode[];
  dependencies: Array<{
    target: GraphNode;
    contact?: GraphNode;
    instruction?: string;
  }>;
}

function byDueDateThenLabel(left: GraphNode, right: GraphNode): number {
  const leftDate = left.dueDate ?? "9999-12-31";
  const rightDate = right.dueDate ?? "9999-12-31";
  return leftDate.localeCompare(rightDate) || left.label.localeCompare(right.label);
}

function associatedContact(
  target: GraphNode,
  graph: Graph,
): GraphNode | undefined {
  if (target.type === "Person" || target.type === "Team") return target;

  if (target.ownerId) {
    const owner = graph.nodes.find((node) => node.id === target.ownerId);
    if (owner?.type === "Person") return owner;
  }

  const ownerEdge = graph.edges.find(
    (edge) => edge.type === "OWNS" && edge.to === target.id,
  );
  if (ownerEdge) {
    const owner = graph.nodes.find((node) => node.id === ownerEdge.from);
    if (owner?.type === "Person") return owner;
  }

  if (target.teamId) {
    return graph.nodes.find(
      (node) => node.id === target.teamId && node.type === "Team",
    );
  }

  return undefined;
}

export function deriveAssignments(
  person: GraphNode,
  graph: Graph,
): AssignmentFact[] {
  const ownedIds = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.type === "OWNS" &&
          edge.from === person.id,
      )
      .map((edge) => edge.to),
  );

  const ownedTasks = graph.nodes.filter(
    (node) =>
      node.type === "Task" &&
      (node.ownerId === person.id || ownedIds.has(node.id)),
  );

  const facts = ownedTasks.map((task): AssignmentFact => {
    const blockerIds = new Set(
      graph.edges
        .filter(
          (edge) =>
            edge.type === "BLOCKS" &&
            (edge.from === task.id || edge.to === task.id),
        )
        .map((edge) => (edge.from === task.id ? edge.to : edge.from)),
    );
    const blockers = graph.nodes.filter(
      (node) => node.type === "Blocker" && blockerIds.has(node.id),
    );

    const dependencies = graph.edges
      .filter(
        (edge) => edge.type === "DEPENDS_ON" && edge.from === task.id,
      )
      .map((edge) => {
        const target = graph.nodes.find((node) => node.id === edge.to);
        if (!target) return undefined;
        const contact = associatedContact(target, graph);
        return {
          target,
          ...(contact ? { contact } : {}),
          ...(edge.note ? { instruction: edge.note } : {}),
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    return { task, blockers, dependencies };
  });

  return facts
    .filter((fact) => fact.task.status !== "done" || fact.blockers.length > 0)
    .sort((left, right) => byDueDateThenLabel(left.task, right.task));
}

export interface ContradictionCandidates {
  nodes: GraphNode[];
  anchorIds: Set<string>;
}

function addEdgeEndpoints(
  ids: Set<string>,
  edge: GraphEdge,
): void {
  ids.add(edge.from);
  ids.add(edge.to);
}

export function selectContradictionCandidates(
  graph: Graph,
  changedIds: readonly string[],
  limit = 48,
): ContradictionCandidates {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const changedNodeIds = new Set<string>();

  for (const id of changedIds) {
    if (nodeById.has(id)) changedNodeIds.add(id);
    const edge = edgeById.get(id);
    if (edge) addEdgeEndpoints(changedNodeIds, edge);
  }

  const anchorIds = new Set(changedNodeIds);
  for (const edge of graph.edges) {
    if (changedNodeIds.has(edge.from) || changedNodeIds.has(edge.to)) {
      addEdgeEndpoints(anchorIds, edge);
    }
  }

  const candidateIds = new Set(anchorIds);
  const relevantTeamIds = new Set<string>();
  for (const id of candidateIds) {
    const node = nodeById.get(id);
    if (node?.type === "Team") relevantTeamIds.add(node.id);
    if (node?.teamId) relevantTeamIds.add(node.teamId);
  }

  for (const edge of graph.edges) {
    if (
      (edge.type === "DEPENDS_ON" || edge.type === "BLOCKS") &&
      (candidateIds.has(edge.from) || candidateIds.has(edge.to))
    ) {
      addEdgeEndpoints(candidateIds, edge);
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (from?.type === "Team") relevantTeamIds.add(from.id);
      if (to?.type === "Team") relevantTeamIds.add(to.id);
      if (from?.teamId) relevantTeamIds.add(from.teamId);
      if (to?.teamId) relevantTeamIds.add(to.teamId);
    }
  }

  for (const node of graph.nodes) {
    if (
      (relevantTeamIds.has(node.id) ||
        (node.teamId && relevantTeamIds.has(node.teamId))) &&
      ["Team", "Task", "Decision", "Blocker"].includes(node.type)
    ) {
      candidateIds.add(node.id);
    }
  }

  const typePriority: Record<GraphNode["type"], number> = {
    Blocker: 0,
    Decision: 1,
    Task: 2,
    Team: 3,
    Person: 4,
  };

  const nodes = [...candidateIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is GraphNode => Boolean(node))
    .sort((left, right) => {
      const anchorOrder = Number(!anchorIds.has(left.id)) - Number(!anchorIds.has(right.id));
      return (
        anchorOrder ||
        typePriority[left.type] - typePriority[right.type] ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, limit);

  return { nodes, anchorIds };
}
