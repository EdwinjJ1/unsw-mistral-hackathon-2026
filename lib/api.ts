import { createFixtureGraph, createMockIngestDelta } from './fixtures';
import { deriveTeamDetail, normalizeTeamDetail } from './derive';
import type { Delta, Graph, TeamDetail } from './types';

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function fetchGraph(mock = false): Promise<Graph> {
  if (mock) return createFixtureGraph();
  const response = await fetch('/api/graph', { cache: 'no-store' });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Graph>;
}

export async function fetchTeamDetail(
  teamId: string,
  graph: Graph,
  mock = false,
): Promise<TeamDetail | null> {
  if (mock) return deriveTeamDetail(graph, teamId);
  try {
    const response = await fetch(`/api/team/${encodeURIComponent(teamId)}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await parseError(response));
    return normalizeTeamDetail((await response.json()) as TeamDetail);
  } catch {
    return deriveTeamDetail(graph, teamId);
  }
}

export async function ingestText(text: string, mock = false): Promise<Delta> {
  if (mock) {
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    return createMockIngestDelta(text);
  }
  const response = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Delta>;
}
