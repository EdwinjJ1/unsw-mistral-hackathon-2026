// Track D - thin HTTP client for the Track A graph API.
// The bot never touches the database or the graph library directly; every read
// and write goes through the frozen routes in docs/CONTRACT.md API.

import type {
  Delta,
  Graph,
  PlanDispatchReceipt,
  PlanFollowupRequest,
  PlanHandoffManifest,
} from '../lib/types';

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

  /** GET /api/plan/handoff - the latest AI plan, already grouped into final DMs. */
  async getPlanHandoff(): Promise<PlanHandoffManifest> {
    const res = await fetch(`${this.baseUrl}/api/plan/handoff`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`GET /api/plan/handoff -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as PlanHandoffManifest;
  }

  /** POST /api/people/discord - persist an exact Discord roster match. */
  async linkDiscordIdentity(personId: string, discordUserId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/people/discord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId, discordUserId }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`POST /api/people/discord -> ${res.status} ${res.statusText} ${detail}`.trim());
    }
  }

  /** POST /api/plan/dispatch - make plan delivery idempotent and visible to the UI. */
  async postPlanDispatchReceipt(
    receipt: Omit<PlanDispatchReceipt, 'updatedAt'>,
  ): Promise<PlanDispatchReceipt> {
    const res = await fetch(`${this.baseUrl}/api/plan/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(receipt),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`POST /api/plan/dispatch -> ${res.status} ${res.statusText} ${detail}`.trim());
    }
    const body = (await res.json()) as { receipt: PlanDispatchReceipt };
    return body.receipt;
  }

  /** GET /api/plan/followup - follow-up requests queued from the web dashboard. */
  async getPlanFollowups(): Promise<PlanFollowupRequest[]> {
    const res = await fetch(`${this.baseUrl}/api/plan/followup`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`GET /api/plan/followup -> ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { requests: PlanFollowupRequest[] };
    return body.requests;
  }

  /** DELETE /api/plan/followup?id=N - acknowledge a handled follow-up request. */
  async consumePlanFollowup(id: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/plan/followup?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`DELETE /api/plan/followup?id=${id} -> ${res.status} ${res.statusText}`);
    }
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
