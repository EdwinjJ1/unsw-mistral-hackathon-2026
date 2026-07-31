import type { Graph, GraphEdge, GraphNode } from './types';

export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Signal {
  severity: SignalSeverity;
  title: string;
  why: string;
  nodeIds: string[];
}

export interface SignalConfig {
  staleAfterHours: number;
  silentAfterHours: number;
}

export const DEFAULT_SIGNAL_CONFIG: Readonly<SignalConfig> = Object.freeze({
  staleAfterHours: 24,
  silentAfterHours: 48,
});

const STALE_NODE_TYPES = new Set<GraphNode['type']>([
  'Task',
  'Decision',
  'Blocker',
]);

function byStableIdentity(left: Signal, right: Signal): number {
  return (
    left.title.localeCompare(right.title) ||
    left.nodeIds.join(',').localeCompare(right.nodeIds.join(','))
  );
}

function sortedNodeIds(...ids: string[]): string[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function nodeIndex(graph: Graph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function timestampOlderThan(
  value: string,
  now: Date,
  thresholdHours: number,
): boolean {
  const timestamp = Date.parse(value);
  const currentTime = now.getTime();

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(currentTime) ||
    !Number.isFinite(thresholdHours) ||
    thresholdHours < 0
  ) {
    return false;
  }

  return timestamp < currentTime - thresholdHours * 60 * 60 * 1000;
}

function isValidIsoDateOnly(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function statusLabel(status: GraphNode['status']): string {
  return (status ?? 'not started').replaceAll('_', ' ');
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function validRelationship(
  edge: GraphEdge,
  nodes: Map<string, GraphNode>,
): { from: GraphNode; to: GraphNode } | undefined {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);

  return from && to ? { from, to } : undefined;
}

export function detectContradictions(graph: Graph): Signal[] {
  const nodes = nodeIndex(graph);

  return graph.edges
    .filter((edge) => edge.type === 'CONFLICTS_WITH')
    .flatMap((edge): Signal[] => {
      const relationship = validRelationship(edge, nodes);
      if (!relationship) {
        return [];
      }

      const { from, to } = relationship;
      const explanation = edge.note
        ? sentence(edge.note)
        : `${from.label} and ${to.label} report incompatible project states.`;

      return [
        {
          severity: 'critical',
          title: `${from.label} conflicts with ${to.label}`,
          why: explanation,
          nodeIds: sortedNodeIds(from.id, to.id),
        },
      ];
    })
    .sort(byStableIdentity);
}

export function detectBlockedDependencies(graph: Graph): Signal[] {
  const nodes = nodeIndex(graph);

  return graph.edges
    .filter((edge) => edge.type === 'DEPENDS_ON')
    .flatMap((edge): Signal[] => {
      const relationship = validRelationship(edge, nodes);
      if (
        !relationship ||
        relationship.from.type !== 'Task' ||
        relationship.to.status !== 'blocked'
      ) {
        return [];
      }

      const { from, to } = relationship;
      return [
        {
          severity: 'critical',
          title: `${from.label} is waiting on blocked work`,
          why: `${from.label} cannot proceed because ${to.label} is blocked.`,
          nodeIds: sortedNodeIds(from.id, to.id),
        },
      ];
    })
    .sort(byStableIdentity);
}

export function detectOverdueTasks(
  graph: Graph,
  now: Date,
  staleAfterHours = DEFAULT_SIGNAL_CONFIG.staleAfterHours,
): Signal[] {
  const today = Number.isFinite(now.getTime())
    ? now.toISOString().slice(0, 10)
    : undefined;

  if (!today) {
    return [];
  }

  return graph.nodes
    .filter(
      (node) =>
        node.type === 'Task' &&
        node.status !== 'done' &&
        isValidIsoDateOnly(node.dueDate) &&
        node.dueDate < today &&
        timestampOlderThan(node.updatedAt, now, staleAfterHours),
    )
    .map(
      (task): Signal => ({
        severity: 'high',
        title: `${task.label} is overdue with no movement`,
        why: `${task.label} was due on ${task.dueDate}, is still ${statusLabel(task.status)}, and has not been updated in over ${staleAfterHours} hours.`,
        nodeIds: [task.id],
      }),
    )
    .sort(byStableIdentity);
}

export function detectUnownedTasks(graph: Graph): Signal[] {
  const nodes = nodeIndex(graph);
  const ownedTaskIds = new Set(
    graph.edges
      .filter((edge) => {
        if (edge.type !== 'OWNS') {
          return false;
        }

        const relationship = validRelationship(edge, nodes);
        return (
          relationship?.from.type === 'Person' &&
          relationship.to.type === 'Task'
        );
      })
      .map((edge) => edge.to),
  );

  return graph.nodes
    .filter((node) => node.type === 'Task' && !ownedTaskIds.has(node.id))
    .map(
      (task): Signal => ({
        severity: 'high',
        title: `${task.label} has no owner`,
        why: `${task.label} has no person accountable for completing it.`,
        nodeIds: [task.id],
      }),
    )
    .sort(byStableIdentity);
}

export function detectStaleFacts(
  graph: Graph,
  now: Date,
  staleAfterHours = DEFAULT_SIGNAL_CONFIG.staleAfterHours,
): Signal[] {
  return graph.nodes
    .filter(
      (node) =>
        STALE_NODE_TYPES.has(node.type) &&
        timestampOlderThan(node.updatedAt, now, staleAfterHours),
    )
    .map(
      (node): Signal => ({
        severity: 'medium',
        title: `${node.label} is going stale`,
        why: `${node.label} has not been updated in over ${staleAfterHours} hours.`,
        nodeIds: [node.id],
      }),
    )
    .sort(byStableIdentity);
}

export function detectOrphans(graph: Graph): Signal[] {
  const teams = graph.nodes.filter((node) => node.type === 'Team');
  const teamIds = new Set(teams.map((team) => team.id));
  const tasks = graph.nodes.filter((node) => node.type === 'Task');
  const populatedTeamIds = new Set(
    tasks
      .map((task) => task.teamId)
      .filter((teamId): teamId is string => Boolean(teamId && teamIds.has(teamId))),
  );

  const orphanTasks = tasks.map((task): Signal | undefined => {
    if (task.teamId && teamIds.has(task.teamId)) {
      return undefined;
    }

    return {
      severity: 'medium',
      title: `${task.label} is not attached to a team`,
      why: task.teamId
        ? `${task.label} points to a team that is not present in the graph.`
        : `${task.label} is not connected to any team.`,
      nodeIds: [task.id],
    };
  });

  const emptyTeams = teams.map((team): Signal | undefined => {
    if (populatedTeamIds.has(team.id)) {
      return undefined;
    }

    return {
      severity: 'medium',
      title: `${team.label} has no tasks`,
      why: `${team.label} has no work attached to it in the graph.`,
      nodeIds: [team.id],
    };
  });

  return [...orphanTasks, ...emptyTeams]
    .filter((signal): signal is Signal => Boolean(signal))
    .sort(byStableIdentity);
}

export function detectSilentOwners(
  graph: Graph,
  now: Date,
  silentAfterHours = DEFAULT_SIGNAL_CONFIG.silentAfterHours,
): Signal[] {
  const nodes = nodeIndex(graph);
  const tasksByOwner = new Map<string, GraphNode[]>();

  for (const edge of graph.edges) {
    if (edge.type !== 'OWNS') {
      continue;
    }

    const relationship = validRelationship(edge, nodes);
    if (
      !relationship ||
      relationship.from.type !== 'Person' ||
      relationship.to.type !== 'Task'
    ) {
      continue;
    }

    const tasks = tasksByOwner.get(relationship.from.id) ?? [];
    tasks.push(relationship.to);
    tasksByOwner.set(relationship.from.id, tasks);
  }

  return graph.nodes
    .filter((node) => node.type === 'Person')
    .flatMap((person): Signal[] => {
      const ownedTasks = tasksByOwner.get(person.id) ?? [];
      const allOwnedWorkIsSilent =
        ownedTasks.length > 0 &&
        ownedTasks.every((task) =>
          timestampOlderThan(task.updatedAt, now, silentAfterHours),
        );

      if (!allOwnedWorkIsSilent) {
        return [];
      }

      return [
        {
          severity: 'low',
          title: `${person.label}'s work has gone quiet`,
          why: `None of ${person.label}'s owned tasks has been updated in over ${silentAfterHours} hours.`,
          nodeIds: sortedNodeIds(
            person.id,
            ...ownedTasks.map((task) => task.id),
          ),
        },
      ];
    })
    .sort(byStableIdentity);
}

export function detectSignals(
  graph: Graph,
  now: Date,
  config: SignalConfig = DEFAULT_SIGNAL_CONFIG,
): Signal[] {
  return [
    ...detectContradictions(graph),
    ...detectBlockedDependencies(graph),
    ...detectOverdueTasks(graph, now, config.staleAfterHours),
    ...detectUnownedTasks(graph),
    ...detectStaleFacts(graph, now, config.staleAfterHours),
    ...detectOrphans(graph),
    ...detectSilentOwners(graph, now, config.silentAfterHours),
  ];
}
