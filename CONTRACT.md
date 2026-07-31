# CONTRACT — freeze this before anyone writes code

Six people working in parallel for twelve hours will not fail because the work is too hard. They will fail because **Track B's node shape doesn't match Track A's, and nobody finds out until hour 9.**

This file is the interface. Agree on it in the first 20 minutes, then everyone builds against it independently and integration becomes boring.

**Rules:**

1. **This file is the source of truth.** Track A lifts these types into real code; everyone else imports from there.
2. **Nobody changes this alone.** A change here breaks other people's work. Announce it in the team channel, get a 👍, then change it.
3. **Build against fake data that matches these types.** Nobody blocks on anybody.

---

## 1. Types

```ts
// ---------- Core ----------

export type NodeType = 'Team' | 'Person' | 'Task' | 'Decision' | 'Blocker';

export type Status =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'at_risk'
  | 'done';

export interface SourceRef {
  kind: 'discord_dm' | 'document' | 'seed';
  ref: string;      // Discord message id, or filename
  quote?: string;   // the exact sentence this fact was derived from
}

export interface GraphNode {
  id: string;               // stable slug — see §3. e.g. "task.rollback-runbook"
  type: NodeType;
  label: string;            // display name, e.g. "Rollback runbook"
  teamId?: string;          // owning Team node id (for Person / Task / Blocker)
  status?: Status;
  summary?: string;         // AI-written, 1–2 sentences. Shown in the detail panel.
  ownerId?: string;         // Person node id (for Task)
  dueDate?: string;         // ISO date, "2026-08-01"
  discordUserId?: string;   // Person nodes ONLY — how the bot DMs them
  updatedAt: string;        // ISO timestamp
  sourceRef?: SourceRef;    // where this came from
}

// ---------- Edges ----------

export type EdgeType =
  | 'MEMBER_OF'       // Person  -> Team
  | 'OWNS'            // Person  -> Task
  | 'DEPENDS_ON'      // Task    -> Task | Team
  | 'BLOCKS'          // Blocker -> Task
  | 'CONFLICTS_WITH'; // Node    -> Node   (the Hidden Signal)

export interface GraphEdge {
  id: string;          // `${from}--${type}--${to}` — deterministic, so upserts dedupe
  from: string;        // GraphNode.id
  to: string;          // GraphNode.id
  type: EdgeType;
  note?: string;       // for CONFLICTS_WITH: one line describing the contradiction
  updatedAt: string;
  sourceRef?: SourceRef;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------- Delta ----------
// Everything that mutates the graph produces one of these.
// The bot, the ingest pipeline, and the contradiction checker all emit Deltas.

export interface Delta {
  upsertNodes?: GraphNode[];
  upsertEdges?: GraphEdge[];
  deleteNodeIds?: string[];
  deleteEdgeIds?: string[];
}
```

## 2. HTTP API

Track A owns all of these. Everyone else only calls them.

| Method | Path | Body | Returns | Used by |
| --- | --- | --- | --- | --- |
| `GET` | `/api/graph` | — | `Graph` | Track B (polls every 3s) |
| `GET` | `/api/team/:id` | — | `TeamDetail` | Track C (detail panel) |
| `GET` | `/api/person/:discordUserId` | — | `Graph` (their subgraph) | Track D (to compose a DM) |
| `POST` | `/api/delta` | `Delta` | `{ ok: true, changed: string[] }` | Track D, Track E |
| `POST` | `/api/ingest` | `{ text: string }` | `Delta` (already applied) | Track C (import page) |

```ts
export interface TeamDetail {
  team: GraphNode;
  members: GraphNode[];
  tasks: GraphNode[];
  blockers: GraphNode[];
  conflicts: GraphEdge[];   // CONFLICTS_WITH edges touching this team
  dependencies: GraphEdge[];// cross-team DEPENDS_ON edges
}
```

**`POST /api/delta` also runs the contradiction check** and appends any `CONFLICTS_WITH` edges it finds. Callers do not have to do this themselves.

## 3. ID rules

IDs are **deterministic slugs**, not random. This is what makes upsert work and lets Mistral reference existing nodes by name.

```
team.engineering
person.alice
task.rollback-runbook
blocker.legal-approval-missing
```

Format: `<lowercase type>.<kebab-case-label>`. If Mistral emits an id that doesn't exist, `POST /api/delta` creates it. If it emits one that does, it updates it. **No `Math.random()` ids anywhere** — they will silently duplicate every node on every write and you will lose an hour finding it.

## 4. Mistral function surface

Track E owns `lib/mistral/`. Everyone else calls these functions and never touches the Mistral SDK directly — one place for keys, retries, and prompt fixes.

```ts
// docs / pasted text -> a graph
generateGraphFromText(text: string): Promise<Delta>;

// cheap gate on an inbound DM reply
triageReply(text: string): Promise<'update' | 'blocker' | 'question' | 'noise'>;

// a reply -> structured graph change
extractDelta(text: string, context: Graph, source: SourceRef): Promise<Delta>;

// what the bot actually sends someone
composeDM(person: GraphNode, subgraph: Graph): Promise<string>;

// the Hidden Signal
findContradictions(graph: Graph, changedIds: string[]): Promise<GraphEdge[]>;
```

Every one of these must have a **hardcoded fallback** for the demo path. If the Mistral call fails on stage, the demo continues. Build the fallback at the same time as the function, not on Saturday morning.

## 5. Environment variables

```bash
MISTRAL_API_KEY=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DATABASE_PATH=./athena.db
```

Commit a `.env.example` with the **keys only, never the values**. This repo is public.
