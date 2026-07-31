// Track D - thin HTTP client for the Track A graph API.
// The bot never touches the database or the graph library directly; every read
// and write goes through the frozen routes in docs/CONTRACT.md API.

import type { Delta, Graph } from '../lib/types';

export interface DeltaResult {
  ok: boolean;
  changed: string[];
}

export class GraphApi {
  constructor(private readonly baseUrl: string) {}

  /** POST /api/ingest - run Issue #6 document extraction and apply its Delta. */
  async ingestText(text: string): Promise<Delta> {
    const res = await fetch(`${this.baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`POST /api/ingest -> ${res.status} ${res.statusText} ${detail}`.trim());
    }
    return (await res.json()) as Delta;
  }

  /** GET /api/person/:discordUserId - the person's subgraph, for composing a DM. */
  async getPersonSubgraph(discordUserId: string): Promise<Graph> {
    const res = await fetch(`${this.baseUrl}/api/person/${encodeURIComponent(discordUserId)}`);
    if (!res.ok) {
      throw new Error(`GET /api/person/${discordUserId} -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as Graph;
  }

  /** POST /api/delta - the only way anything changes. Runs the contradiction check itself. */
  async postDelta(delta: Delta): Promise<DeltaResult> {
    const res = await fetch(`${this.baseUrl}/api/delta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(delta),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`POST /api/delta -> ${res.status} ${res.statusText} ${detail}`.trim());
    }
    return (await res.json()) as DeltaResult;
  }
}
