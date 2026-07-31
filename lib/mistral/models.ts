import type { EdgeType, NodeType, Status } from "../types";

export interface DeltaNodeDraft {
  id?: string | undefined;
  type: NodeType;
  label: string;
  teamId?: string | null | undefined;
  status?: Status | null | undefined;
  summary?: string | null | undefined;
  ownerId?: string | null | undefined;
  dueDate?: string | null | undefined;
  evidenceQuote?: string | null | undefined;
}

export interface DeltaEdgeDraft {
  from: string;
  to: string;
  type: EdgeType;
  note?: string | null | undefined;
  evidenceQuote?: string | null | undefined;
}

export interface DeltaDraft {
  nodes: DeltaNodeDraft[];
  edges: DeltaEdgeDraft[];
}

export interface ConflictDraft {
  from: string;
  to: string;
  note: string;
}

export interface StructuredTransportRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}

export type StructuredTransport = (
  request: StructuredTransportRequest,
) => Promise<unknown>;
