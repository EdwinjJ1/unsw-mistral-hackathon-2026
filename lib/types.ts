export type NodeType = "Team" | "Person" | "Task" | "Decision" | "Blocker";
export type Status = "not_started" | "in_progress" | "blocked" | "at_risk" | "done";

export interface SourceRef {
  kind: "discord_dm" | "document" | "seed";
  ref: string;
  quote?: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  teamId?: string;
  status?: Status;
  summary?: string;
  ownerId?: string;
  dueDate?: string;
  discordUserId?: string;
  updatedAt: string;
  sourceRef?: SourceRef;
}

export type EdgeType = "MEMBER_OF" | "OWNS" | "DEPENDS_ON" | "BLOCKS" | "CONFLICTS_WITH";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  note?: string;
  updatedAt: string;
  sourceRef?: SourceRef;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Delta {
  upsertNodes?: GraphNode[];
  upsertEdges?: GraphEdge[];
  deleteNodeIds?: string[];
  deleteEdgeIds?: string[];
}

export interface TeamDetail {
  team: GraphNode;
  members: GraphNode[];
  tasks: GraphNode[];
  blockers: GraphNode[];
  conflicts: GraphEdge[];
  dependencies: GraphEdge[];
}
