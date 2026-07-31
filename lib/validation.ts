import type {
  Delta,
  EdgeType,
  Graph,
  GraphEdge,
  GraphNode,
  NodeType,
  SourceRef,
  Status,
} from './types';

const NODE_TYPES = new Set<NodeType>(['Team', 'Person', 'Task', 'Decision', 'Blocker']);
const STATUSES = new Set<Status>(['not_started', 'in_progress', 'blocked', 'at_risk', 'done']);
const EDGE_TYPES = new Set<EdgeType>([
  'MEMBER_OF',
  'OWNS',
  'DEPENDS_ON',
  'BLOCKS',
  'CONFLICTS_WITH',
]);
const SOURCE_KINDS = new Set<SourceRef['kind']>(['discord_dm', 'document', 'seed']);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${context}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${context}.${key} must be a string when provided`);
  }
  return value;
}

function parseSourceRef(value: unknown, context: string): SourceRef | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ValidationError(`${context} must be an object`);
  }

  const kind = requiredString(value, 'kind', context);
  if (!SOURCE_KINDS.has(kind as SourceRef['kind'])) {
    throw new ValidationError(`${context}.kind is not supported`);
  }

  return {
    kind: kind as SourceRef['kind'],
    ref: requiredString(value, 'ref', context),
    quote: optionalString(value, 'quote', context),
  };
}

export function parseGraphNode(value: unknown, context = 'node'): GraphNode {
  if (!isRecord(value)) {
    throw new ValidationError(`${context} must be an object`);
  }

  const type = requiredString(value, 'type', context);
  if (!NODE_TYPES.has(type as NodeType)) {
    throw new ValidationError(`${context}.type is not supported`);
  }

  const status = optionalString(value, 'status', context);
  if (status !== undefined && !STATUSES.has(status as Status)) {
    throw new ValidationError(`${context}.status is not supported`);
  }

  return {
    id: requiredString(value, 'id', context),
    type: type as NodeType,
    label: requiredString(value, 'label', context),
    teamId: optionalString(value, 'teamId', context),
    status: status as Status | undefined,
    summary: optionalString(value, 'summary', context),
    ownerId: optionalString(value, 'ownerId', context),
    dueDate: optionalString(value, 'dueDate', context),
    discordUserId: optionalString(value, 'discordUserId', context),
    updatedAt: requiredString(value, 'updatedAt', context),
    sourceRef: parseSourceRef(value.sourceRef, `${context}.sourceRef`),
  };
}

export function parseGraphEdge(value: unknown, context = 'edge'): GraphEdge {
  if (!isRecord(value)) {
    throw new ValidationError(`${context} must be an object`);
  }

  const type = requiredString(value, 'type', context);
  if (!EDGE_TYPES.has(type as EdgeType)) {
    throw new ValidationError(`${context}.type is not supported`);
  }

  return {
    id: requiredString(value, 'id', context),
    from: requiredString(value, 'from', context),
    to: requiredString(value, 'to', context),
    type: type as EdgeType,
    note: optionalString(value, 'note', context),
    updatedAt: requiredString(value, 'updatedAt', context),
    sourceRef: parseSourceRef(value.sourceRef, `${context}.sourceRef`),
  };
}

function parseOptionalArray<T>(
  record: Record<string, unknown>,
  key: string,
  parser: (value: unknown, context: string) => T,
): T[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError(`${key} must be an array when provided`);
  }
  return value.map((item, index) => parser(item, `${key}[${index}]`));
}

function parseOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === '')) {
    throw new ValidationError(`${key} must be an array of non-empty strings`);
  }
  return [...value] as string[];
}

export function parseDelta(value: unknown): Delta {
  if (!isRecord(value)) {
    throw new ValidationError('request body must be an object');
  }

  const delta: Delta = {
    upsertNodes: parseOptionalArray(value, 'upsertNodes', parseGraphNode),
    upsertEdges: parseOptionalArray(value, 'upsertEdges', parseGraphEdge),
    deleteNodeIds: parseOptionalStringArray(value, 'deleteNodeIds'),
    deleteEdgeIds: parseOptionalStringArray(value, 'deleteEdgeIds'),
  };

  if (
    delta.upsertNodes === undefined
    && delta.upsertEdges === undefined
    && delta.deleteNodeIds === undefined
    && delta.deleteEdgeIds === undefined
  ) {
    throw new ValidationError('Delta must contain at least one operation');
  }

  return delta;
}

export function parseGraph(value: unknown): Graph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new ValidationError('seed must contain nodes and edges arrays');
  }

  return {
    nodes: value.nodes.map((node, index) => parseGraphNode(node, `nodes[${index}]`)),
    edges: value.edges.map((edge, index) => parseGraphEdge(edge, `edges[${index}]`)),
  };
}

export function parseIngestRequest(value: unknown): { text: string } {
  if (!isRecord(value)) {
    throw new ValidationError('request body must be an object');
  }
  const text = requiredString(value, 'text', 'request body').trim();
  if (text.length > 100_000) {
    throw new ValidationError('request body.text must not exceed 100,000 characters');
  }
  return { text };
}
