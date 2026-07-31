import fs from 'node:fs';
import path from 'node:path';
import { closeDb, resetDb } from '../lib/db';
import { applyDelta, getGraph } from '../lib/graph';
import type { Graph } from '../lib/types';
import { parseGraph, ValidationError } from '../lib/validation';

function validateSeedIntegrity(graph: Graph): void {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      throw new ValidationError(`seed contains duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new ValidationError(`seed contains duplicate edge id: ${edge.id}`);
    }
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new ValidationError(`seed edge ${edge.id} has a missing endpoint`);
    }
    edgeIds.add(edge.id);
  }
}

const seedPath = path.resolve(process.cwd(), 'data/seed.json');
const rawSeed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as unknown;
const seed = parseGraph(rawSeed);
validateSeedIntegrity(seed);

resetDb();
applyDelta({ upsertNodes: seed.nodes, upsertEdges: seed.edges });

const graph = getGraph();
console.log(`Seeded ${graph.nodes.length} nodes and ${graph.edges.length} edges.`);
closeDb();
