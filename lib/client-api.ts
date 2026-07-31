import type { DeliveryPlan, Graph, IngestResult, PlanHandoffManifest } from './types';

async function parseError(response: Response) {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 120_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The scan timed out after 2 minutes. The source may be unavailable or too large; please retry.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchGraph(): Promise<Graph> {
  const response = await fetch('/api/graph', { cache: 'no-store' });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<Graph>;
}

export async function ingestText(text: string): Promise<IngestResult> {
  const response = await fetchWithTimeout('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<IngestResult>;
}

export async function ingestFiles(files: Array<{ file: File; path: string }>): Promise<IngestResult> {
  const body = new FormData();
  for (const item of files) {
    body.append('files', item.file);
    body.append('paths', item.path);
  }
  body.append('replace', 'true');
  const response = await fetchWithTimeout('/api/ingest/files', { method: 'POST', body });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<IngestResult>;
}

export async function ingestGitHubDataset(url: string): Promise<IngestResult> {
  const response = await fetchWithTimeout('/api/ingest/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, replace: true }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<IngestResult>;
}

export async function fetchPlan(): Promise<DeliveryPlan> {
  const response = await fetch('/api/plan', { cache: 'no-store' });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<DeliveryPlan>;
}

export async function fetchPlanHandoff(): Promise<PlanHandoffManifest> {
  const response = await fetch('/api/plan/handoff', { cache: 'no-store' });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<PlanHandoffManifest>;
}

export async function linkDiscordIdentity(personId: string, discordUserId: string): Promise<void> {
  const response = await fetch('/api/people/discord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId, discordUserId }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}
