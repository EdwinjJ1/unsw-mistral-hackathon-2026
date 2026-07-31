import type { Delta, Graph, GraphNode, SourceRef } from "../../types";

export const demoReply =
  "runbook's done, but legal never got back to me — blocked.";

export const demoSource: SourceRef = {
  kind: "discord_dm",
  ref: "discord-message-demo-001",
  quote: demoReply,
};

export function makeDemoGraph(): Graph {
  const updatedAt = "2026-07-31T06:00:00.000Z";
  return {
    nodes: [
      {
        id: "team.engineering",
        type: "Team",
        label: "Engineering",
        updatedAt,
      },
      {
        id: "team.legal",
        type: "Team",
        label: "Legal",
        updatedAt,
      },
      {
        id: "person.engineer",
        type: "Person",
        label: "Alice",
        teamId: "team.engineering",
        discordUserId: "discord-demo-user",
        updatedAt,
      },
      {
        id: "task.rollback-runbook",
        type: "Task",
        label: "Rollback runbook",
        teamId: "team.engineering",
        ownerId: "person.engineer",
        status: "in_progress",
        summary: "Prepare the rollback runbook for launch.",
        dueDate: "2026-08-01",
        updatedAt,
      },
      {
        id: "decision.legal-approvals-cleared",
        type: "Decision",
        label: "Legal approvals cleared",
        teamId: "team.legal",
        status: "done",
        summary: "All Legal approvals are cleared.",
        updatedAt,
      },
      {
        id: "task.unrelated-complete",
        type: "Task",
        label: "Publish old notes",
        teamId: "team.engineering",
        ownerId: "person.engineer",
        status: "done",
        updatedAt,
      },
    ],
    edges: [
      {
        id: "person.engineer--OWNS--task.rollback-runbook",
        from: "person.engineer",
        to: "task.rollback-runbook",
        type: "OWNS",
        updatedAt,
      },
      {
        id: "task.rollback-runbook--DEPENDS_ON--team.legal",
        from: "task.rollback-runbook",
        to: "team.legal",
        type: "DEPENDS_ON",
        note: "Confirm the retention window",
        updatedAt,
      },
    ],
  };
}

export function mergeDeltaForUnitTest(graph: Graph, delta: Delta): Graph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const node of delta.upsertNodes ?? []) nodes.set(node.id, node);
  for (const edge of delta.upsertEdges ?? []) edges.set(edge.id, edge);
  for (const id of delta.deleteNodeIds ?? []) nodes.delete(id);
  for (const id of delta.deleteEdgeIds ?? []) edges.delete(id);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function demoPerson(graph: Graph): GraphNode {
  return graph.nodes.find((node) => node.id === "person.engineer")!;
}
