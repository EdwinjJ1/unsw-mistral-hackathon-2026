# CONTRACT

Frozen interface. Six people build against this in parallel. Read it before writing code.

## Rules

1. **Check before you build.** Grep the repo for the type, route, or function first. If it exists, import it. Never write a second version of something that already has an owner.
2. **Ownership:** Track A owns `lib/types.ts`, `lib/graph.ts`, `app/api/*`. Track E owns `lib/mistral/*`. Everyone else imports; nobody re-implements.
3. **Changing this file breaks other people.** Post in the channel, get a 👍, then change it.
4. **Prompts frame the scope, they don't do the work.** Two or three sentences plus a JSON schema. No few-shot walls, no roleplay preamble. If a prompt is longer than the function calling it, it should have been two calls.

## Types — `lib/types.ts` (Track A)

```ts
type NodeType = 'Team' | 'Person' | 'Task' | 'Decision' | 'Blocker';
type Status = 'not_started' | 'in_progress' | 'blocked' | 'at_risk' | 'done';

interface SourceRef { kind: 'discord_dm' | 'document' | 'seed'; ref: string; quote?: string }

interface GraphNode {
  id: string;              // slug `${type}.${kebab-label}` — deterministic, never random
  type: NodeType;
  label: string;
  teamId?: string;         // owning Team (Person / Task / Blocker)
  status?: Status;
  summary?: string;        // AI-written, 1-2 sentences
  ownerId?: string;        // Person id (Task only)
  dueDate?: string;        // ISO date
  discordUserId?: string;  // Person only — how the bot DMs them
  updatedAt: string;       // ISO timestamp
  sourceRef?: SourceRef;
}

type EdgeType = 'MEMBER_OF' | 'OWNS' | 'DEPENDS_ON' | 'BLOCKS' | 'CONFLICTS_WITH';

interface GraphEdge {
  id: string;              // `${from}--${type}--${to}`
  from: string; to: string; type: EdgeType;
  note?: string;           // CONFLICTS_WITH: one line on what the contradiction is
  updatedAt: string;
  sourceRef?: SourceRef;
}

interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

interface Delta {
  upsertNodes?: GraphNode[]; upsertEdges?: GraphEdge[];
  deleteNodeIds?: string[];  deleteEdgeIds?: string[];
}

interface TeamDetail {
  team: GraphNode;
  members: GraphNode[];
  tasks: GraphNode[];
  blockers: GraphNode[];
  conflicts: GraphEdge[];     // CONFLICTS_WITH edges touching this team
  dependencies: GraphEdge[];  // cross-team DEPENDS_ON edges
}
```

**IDs are deterministic slugs** (`task.rollback-runbook`). Upsert depends on it. No `Math.random()` — random ids silently duplicate every node on every write.

## API — `app/api/` (Track A)

| Route | Body | Returns | Caller |
| --- | --- | --- | --- |
| `GET /api/graph` | — | `Graph` | B, polls every 3s |
| `GET /api/team/:id` | — | `TeamDetail` | C |
| `GET /api/person/:discordUserId` | — | `Graph` (their subgraph) | D |
| `POST /api/delta` | `Delta` | `{ ok, changed: string[] }` | D, E |
| `POST /api/ingest` | `{ text: string }` | `Delta`, already applied | C |

`POST /api/delta` runs the contradiction check itself. Callers don't.

## Mistral — `lib/mistral/` (Track E)

Only this folder imports the Mistral SDK. One place for keys, retries, and fallbacks.

```ts
generateGraphFromText(text: string): Promise<Delta>
triageReply(text: string): Promise<'update' | 'blocker' | 'question' | 'noise'>
extractDelta(text: string, context: Graph, source: SourceRef): Promise<Delta>
composeDM(person: GraphNode, subgraph: Graph): Promise<string>
findContradictions(graph: Graph, changedIds: string[]): Promise<GraphEdge[]>
```

- Always pass existing node ids as context, so the model updates instead of duplicating.
- Every function needs a hardcoded fallback for the demo path. Write it alongside the function, not on Saturday morning.

## Env

```
MISTRAL_API_KEY=   DISCORD_BOT_TOKEN=   DISCORD_GUILD_ID=   DATABASE_PATH=./athena.db
```

Repo is public — commit `.env.example` with key names only, never values.
