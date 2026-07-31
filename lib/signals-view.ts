import type { Graph } from './types';
import type { Signal } from './signals';

export interface ContradictionSource {
  label: string;
  nodeId: string;
  quote: string;
}

const SOURCE_UNAVAILABLE = 'Source quote unavailable';

export function getContradictionSources(
  signal: Signal,
  graph: Graph,
): ContradictionSource[] {
  const signalNodeIds = new Set(signal.nodeIds);
  const conflict = graph.edges.find(
    (edge) =>
      edge.type === 'CONFLICTS_WITH' &&
      signalNodeIds.has(edge.from) &&
      signalNodeIds.has(edge.to),
  );

  if (!conflict) {
    return [];
  }

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const sources = [nodes.get(conflict.from), nodes.get(conflict.to)];

  if (sources.some((node) => !node)) {
    return [];
  }

  return sources.map((node) => ({
    nodeId: node!.id,
    label: node!.label,
    quote: node!.sourceRef?.quote?.trim() || SOURCE_UNAVAILABLE,
  }));
}
