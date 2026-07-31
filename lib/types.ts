// Shared types — docs/CONTRACT.md §Types, verbatim.
// Track A owns this file. Everyone imports from here; nobody re-declares these.
// Changing a type here breaks five other people. Post in the channel first.

export type NodeType = 'Team' | 'Person' | 'Task' | 'Decision' | 'Blocker';
export type Status = 'not_started' | 'in_progress' | 'blocked' | 'at_risk' | 'done';

export interface SourceRef { kind: 'discord_dm' | 'document' | 'seed'; ref: string; quote?: string }

export interface GraphNode {
  id: string;              // slug `${type}.${kebab-label}` — deterministic, never random
  type: NodeType;
  label: string;
  teamId?: string;         // owning Team (Person / Task / Blocker)
  status?: Status;
  summary?: string;        // AI-written, 1-2 sentences
  ownerId?: string;        // Person id (Task only)
  dueDate?: string;        // ISO date
  discordUserId?: string;  // Person only — how the bot DMs them
  updatedAt: string;       // ISO timestamp
  sourceRef?: SourceRef;
}

export type EdgeType = 'MEMBER_OF' | 'OWNS' | 'DEPENDS_ON' | 'BLOCKS' | 'CONFLICTS_WITH';

export interface GraphEdge {
  id: string;              // `${from}--${type}--${to}`
  from: string; to: string; type: EdgeType;
  note?: string;           // CONFLICTS_WITH: one line on what the contradiction is
  updatedAt: string;
  sourceRef?: SourceRef;
}

export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface Delta {
  upsertNodes?: GraphNode[]; upsertEdges?: GraphEdge[];
  deleteNodeIds?: string[];  deleteEdgeIds?: string[];
}

export interface TeamDetail {
  team: GraphNode;
  members: GraphNode[];
  tasks: GraphNode[];
  blockers: GraphNode[];
  conflicts: GraphEdge[];     // CONFLICTS_WITH edges touching this team
  dependencies: GraphEdge[];  // cross-team DEPENDS_ON edges
}

export type AssignmentReason =
  | 'document_owner'
  | 'existing_owner'
  | 'department_workload';

export interface PlanAssignment {
  taskId: string;
  title: string;
  description?: string;
  departmentId?: string;
  department: string;
  ownerId?: string;
  owner: string;
  discordUserId?: string;
  status: Status;
  dueDate?: string;
  dependencyTaskIds: string[];
  sourceRef?: SourceRef;
  assignmentReason?: AssignmentReason;
}

export interface DeliveryPlan {
  id: string;
  generatedAt: string;
  sourceName: string;
  summary: string;
  assignments: PlanAssignment[];
  clarificationQuestions: string[];
  bot: {
    channel: 'discord';
    ready: boolean;
    instructions: string;
  };
}

export interface IngestResult extends Delta {
  plan: DeliveryPlan;
  analysisMode: 'mistral' | 'fallback';
}

export type PlanDispatchStatus = 'sent' | 'unmatched' | 'failed';

export interface PlanDispatchReceipt {
  planId: string;
  ownerKey: string;
  ownerId?: string;
  owner: string;
  discordUserId?: string;
  status: PlanDispatchStatus;
  messageId?: string;
  detail?: string;
  updatedAt: string;
}

export type PlanHandoffStatus = 'pending' | PlanDispatchStatus;

export interface PlanHandoff {
  ownerKey: string;
  ownerId?: string;
  owner: string;
  department: string;
  discordUserId?: string;
  assignments: PlanAssignment[];
  message: string;
  status: PlanHandoffStatus;
  messageId?: string;
  detail?: string;
}

export interface PlanHandoffManifest {
  planId: string;
  generatedAt: string;
  sourceName: string;
  summary: string;
  handoffs: PlanHandoff[];
  clarificationQuestions: string[];
  counts: {
    assignments: number;
    recipients: number;
    ready: number;
    missingIdentity: number;
    unassigned: number;
    sent: number;
    failed: number;
  };
}

// --- id helpers ----------------------------------------------------------
// IDs are deterministic slugs. No Math.random() — random ids silently
// duplicate every node on every write.

export function kebab(label: string): string {
  return label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** `nodeId('Task', 'Rollback runbook')` -> `task.rollback-runbook` */
export function nodeId(type: NodeType, label: string): string {
  return `${type.toLowerCase()}.${kebab(label)}`;
}

/** `edgeId(a, 'OWNS', b)` -> `a--OWNS--b` */
export function edgeId(from: string, type: EdgeType, to: string): string {
  return `${from}--${type}--${to}`;
}
