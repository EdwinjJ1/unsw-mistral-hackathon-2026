import type Database from 'better-sqlite3';
import { getDb } from './db';
import type {
  DeliveryPlan,
  Delta,
  Graph,
  GraphEdge,
  GraphNode,
  PlanDispatchReceipt,
  SourceRef,
  TeamDetail,
} from './types';

interface NodeRow {
  id: string;
  type: GraphNode['type'];
  label: string;
  teamId: string | null;
  status: GraphNode['status'] | null;
  summary: string | null;
  ownerId: string | null;
  dueDate: string | null;
  discordUserId: string | null;
  updatedAt: string;
  sourceRef: string | null;
}

interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  type: GraphEdge['type'];
  note: string | null;
  updatedAt: string;
  sourceRef: string | null;
}

function parseStoredSource(value: string | null): SourceRef | undefined {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as SourceRef;
  } catch {
    return undefined;
  }
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function mapNode(row: NodeRow): GraphNode {
  return compact({
    id: row.id,
    type: row.type,
    label: row.label,
    teamId: row.teamId ?? undefined,
    status: row.status ?? undefined,
    summary: row.summary ?? undefined,
    ownerId: row.ownerId ?? undefined,
    dueDate: row.dueDate ?? undefined,
    discordUserId: row.discordUserId ?? undefined,
    updatedAt: row.updatedAt,
    sourceRef: parseStoredSource(row.sourceRef),
  });
}

function mapEdge(row: EdgeRow): GraphEdge {
  return compact({
    id: row.id,
    from: row.from_id,
    to: row.to_id,
    type: row.type,
    note: row.note ?? undefined,
    updatedAt: row.updatedAt,
    sourceRef: parseStoredSource(row.sourceRef),
  });
}

export function getGraph(): Graph {
  const db = getDb();
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY id').all() as NodeRow[];
  const edges = db.prepare('SELECT * FROM edges ORDER BY id').all() as EdgeRow[];
  return { nodes: nodes.map(mapNode), edges: edges.map(mapEdge) };
}

function serialiseSource(sourceRef: SourceRef | undefined): string | null {
  return sourceRef === undefined ? null : JSON.stringify(sourceRef);
}

function graphTransaction(db: Database.Database, delta: Delta): string[] {
  const changed = new Set<string>();
  const upsertNode = db.prepare(`
    INSERT INTO nodes (
      id, type, label, teamId, status, summary, ownerId, dueDate,
      discordUserId, updatedAt, sourceRef
    ) VALUES (
      @id, @type, @label, @teamId, @status, @summary, @ownerId, @dueDate,
      @discordUserId, @updatedAt, @sourceRef
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      label = excluded.label,
      teamId = COALESCE(excluded.teamId, nodes.teamId),
      status = COALESCE(excluded.status, nodes.status),
      summary = COALESCE(excluded.summary, nodes.summary),
      ownerId = COALESCE(excluded.ownerId, nodes.ownerId),
      dueDate = COALESCE(excluded.dueDate, nodes.dueDate),
      discordUserId = COALESCE(excluded.discordUserId, nodes.discordUserId),
      updatedAt = excluded.updatedAt,
      sourceRef = COALESCE(excluded.sourceRef, nodes.sourceRef)
  `);
  const upsertEdge = db.prepare(`
    INSERT INTO edges (id, from_id, to_id, type, note, updatedAt, sourceRef)
    VALUES (@id, @from, @to, @type, @note, @updatedAt, @sourceRef)
    ON CONFLICT(id) DO UPDATE SET
      from_id = excluded.from_id,
      to_id = excluded.to_id,
      type = excluded.type,
      note = COALESCE(excluded.note, edges.note),
      updatedAt = excluded.updatedAt,
      sourceRef = COALESCE(excluded.sourceRef, edges.sourceRef)
  `);
  const deleteEdge = db.prepare('DELETE FROM edges WHERE id = ?');
  const deleteNode = db.prepare('DELETE FROM nodes WHERE id = ?');
  const touchingEdges = db.prepare(
    'SELECT id FROM edges WHERE from_id = ? OR to_id = ? ORDER BY id',
  );

  for (const id of delta.deleteEdgeIds ?? []) {
    deleteEdge.run(id);
    changed.add(id);
  }

  for (const id of delta.deleteNodeIds ?? []) {
    const cascaded = touchingEdges.all(id, id) as Array<{ id: string }>;
    cascaded.forEach((edge) => changed.add(edge.id));
    deleteNode.run(id);
    changed.add(id);
  }

  for (const node of delta.upsertNodes ?? []) {
    upsertNode.run({
      ...node,
      teamId: node.teamId ?? null,
      status: node.status ?? null,
      summary: node.summary ?? null,
      ownerId: node.ownerId ?? null,
      dueDate: node.dueDate ?? null,
      discordUserId: node.discordUserId ?? null,
      sourceRef: serialiseSource(node.sourceRef),
    });
    changed.add(node.id);
  }

  for (const edge of delta.upsertEdges ?? []) {
    upsertEdge.run({
      ...edge,
      note: edge.note ?? null,
      sourceRef: serialiseSource(edge.sourceRef),
    });
    changed.add(edge.id);
  }

  return [...changed];
}

/**
 * Apply one graph delta atomically.
 *
 * Optional fields are merge semantics: omitting a field preserves its existing
 * value. Explicit field clearing is intentionally not part of the frozen Delta
 * contract.
 */
export function applyDelta(delta: Delta): { changed: string[] } {
  const db = getDb();
  return {
    changed: db.transaction((input: Delta) => graphTransaction(db, input))(delta),
  };
}

export function getTeamDetail(id: string): TeamDetail | null {
  const graph = getGraph();
  const team = graph.nodes.find((node) => node.id === id && node.type === 'Team');
  if (!team) return null;

  const memberIdsFromEdges = new Set(
    graph.edges
      .filter((edge) => edge.type === 'MEMBER_OF' && edge.to === id)
      .map((edge) => edge.from),
  );
  const members = graph.nodes.filter(
    (node) =>
      node.type === 'Person'
      && (node.teamId === id || memberIdsFromEdges.has(node.id)),
  );
  const tasks = graph.nodes.filter((node) => node.type === 'Task' && node.teamId === id);
  const blockers = graph.nodes.filter(
    (node) => node.type === 'Blocker' && node.teamId === id,
  );
  const localIds = new Set([
    id,
    ...graph.nodes.filter((node) => node.teamId === id).map((node) => node.id),
    ...members.map((member) => member.id),
  ]);

  const conflicts = graph.edges.filter(
    (edge) =>
      edge.type === 'CONFLICTS_WITH'
      && (localIds.has(edge.from) || localIds.has(edge.to)),
  );
  const dependencies = graph.edges.filter(
    (edge) =>
      edge.type === 'DEPENDS_ON'
      && localIds.has(edge.from) !== localIds.has(edge.to),
  );

  return { team, members, tasks, blockers, conflicts, dependencies };
}

export function getPersonSubgraph(discordUserId: string): Graph {
  const graph = getGraph();
  const person = graph.nodes.find(
    (node) => node.type === 'Person' && node.discordUserId === discordUserId,
  );
  if (!person) return { nodes: [], edges: [] };

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = new Set<string>([person.id]);
  if (person.teamId) selected.add(person.teamId);

  for (const edge of graph.edges) {
    if (edge.type === 'MEMBER_OF' && edge.from === person.id) selected.add(edge.to);
  }

  const ownedTaskIds = new Set(
    graph.nodes
      .filter((node) => node.type === 'Task' && node.ownerId === person.id)
      .map((node) => node.id),
  );
  for (const edge of graph.edges) {
    if (edge.type === 'OWNS' && edge.from === person.id) ownedTaskIds.add(edge.to);
  }
  ownedTaskIds.forEach((id) => selected.add(id));

  for (const edge of graph.edges) {
    if (ownedTaskIds.has(edge.from) || ownedTaskIds.has(edge.to)) {
      selected.add(edge.from);
      selected.add(edge.to);
    }
  }

  for (const id of [...selected]) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.ownerId) selected.add(node.ownerId);
    if (node.teamId) selected.add(node.teamId);
  }

  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const edges = graph.edges.filter(
    (edge) => selected.has(edge.from) && selected.has(edge.to),
  );
  return { nodes, edges };
}

export function savePlan(plan: DeliveryPlan): void {
  getDb().prepare(`
    INSERT INTO plan_deliveries (id, sourceName, generatedAt, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sourceName = excluded.sourceName,
      generatedAt = excluded.generatedAt,
      payload = excluded.payload
  `).run(plan.id, plan.sourceName, plan.generatedAt, JSON.stringify(plan));
}

export function getLatestPlan(): DeliveryPlan | null {
  const row = getDb().prepare(
    'SELECT payload FROM plan_deliveries ORDER BY generatedAt DESC LIMIT 1',
  ).get() as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as DeliveryPlan : null;
}

export function getPlanDispatchReceipts(planId: string): PlanDispatchReceipt[] {
  return getDb().prepare(`
    SELECT planId, ownerKey, ownerId, owner, discordUserId, status, messageId, detail, updatedAt
    FROM plan_dispatch_receipts
    WHERE planId = ?
    ORDER BY ownerKey
  `).all(planId) as PlanDispatchReceipt[];
}

export function savePlanDispatchReceipt(receipt: PlanDispatchReceipt): void {
  getDb().prepare(`
    INSERT INTO plan_dispatch_receipts (
      planId, ownerKey, ownerId, owner, discordUserId, status, messageId, detail, updatedAt
    ) VALUES (
      @planId, @ownerKey, @ownerId, @owner, @discordUserId, @status, @messageId, @detail, @updatedAt
    )
    ON CONFLICT(planId, ownerKey) DO UPDATE SET
      ownerId = excluded.ownerId,
      owner = excluded.owner,
      discordUserId = excluded.discordUserId,
      status = excluded.status,
      messageId = excluded.messageId,
      detail = excluded.detail,
      updatedAt = excluded.updatedAt
  `).run({
    ...receipt,
    ownerId: receipt.ownerId ?? null,
    discordUserId: receipt.discordUserId ?? null,
    messageId: receipt.messageId ?? null,
    detail: receipt.detail ?? null,
  });
}
