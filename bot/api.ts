// Track D - thin HTTP client for the Track A graph API.
// The bot never touches the database or the graph library directly; every read
// and write goes through the frozen routes in docs/CONTRACT.md API.

import type { Delta, Graph } from '../lib/types';
import type { Reminder } from '../lib/reminders';

export interface DeltaResult {
  ok: boolean;
  changed: string[];
}

export class GraphApi {
  constructor(
    private readonly baseUrl: string,
    private readonly workerSecret?: string,
  ) {}

  private workerHeaders(): HeadersInit {
    return {
      'content-type': 'application/json',
      ...(this.workerSecret ? { 'x-athena-worker-secret': this.workerSecret } : {}),
    };
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

  /** Atomically lease reminders that are due. */
  async claimDueReminders(): Promise<Reminder[]> {
    const res = await fetch(`${this.baseUrl}/api/reminders/claim`, {
      method: 'POST',
      headers: this.workerHeaders(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`POST /api/reminders/claim -> ${res.status} ${detail}`.trim());
    }
    const payload = await res.json() as { reminders: Reminder[] };
    return payload.reminders;
  }

  /** Release a reminder lease with its Discord delivery result. */
  async finishReminder(
    id: string,
    outcome: { sent: true; messageId: string } | { sent: false; error: string },
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/reminders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.workerHeaders(),
      body: JSON.stringify(outcome),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`PATCH /api/reminders/${id} -> ${res.status} ${detail}`.trim());
    }
  }
}
