import 'server-only';

import { applyDelta, getGraph, savePlan } from './graph';
import { analyseDocument } from './mistral/documents';
import { analysisToPlan } from './planning';
import type { ExtractedDocument } from './document-files';
import type { IngestResult } from './types';

const MAX_CORPUS_CHARS = 180_000;

export async function ingestDocumentSet({
  documents,
  sourceName,
  replace = true,
}: {
  documents: ExtractedDocument[];
  sourceName: string;
  replace?: boolean;
}): Promise<IngestResult> {
  if (!documents.length) throw new Error('No readable documents were supplied.');
  let remaining = MAX_CORPUS_CHARS;
  const sections: string[] = [];
  for (const document of documents) {
    if (remaining <= 0) break;
    const text = document.text.slice(0, remaining);
    sections.push(`--- FILE: ${document.name} ---\n${text}`);
    remaining -= text.length;
  }
  const currentGraph = getGraph();
  const analysisGraph = replace ? { nodes: [], edges: [] } : currentGraph;
  const { analysis, mode } = await analyseDocument(
    sections.join('\n\n'),
    sourceName,
    analysisGraph,
  );
  const { delta, plan } = analysisToPlan(analysisGraph, analysis, sourceName);
  const generatedCount = delta.upsertNodes?.length ?? 0;
  if (replace && generatedCount === 0) {
    throw new Error('The documents did not contain enough organisation data to create a graph.');
  }
  const appliedDelta = replace
    ? { ...delta, deleteNodeIds: currentGraph.nodes.map((node) => node.id) }
    : delta;
  applyDelta(appliedDelta);
  savePlan(plan);
  return { ...appliedDelta, plan, analysisMode: mode };
}
