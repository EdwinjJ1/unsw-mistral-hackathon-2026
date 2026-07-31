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
| `GET /api/plan` | — | latest `DeliveryPlan` | C, D |
| `GET /api/plan/handoff` | — | owner-grouped `PlanHandoffManifest` | D |
| `POST /api/people/discord` | `{ personId, discordUserId }` | `{ ok, personId, discordUserId }` | C, D |
| `GET /api/plan/dispatch?planId=...` | — | saved dispatch receipts | D |
| `POST /api/plan/dispatch` | `PlanDispatchReceipt` without trusted timestamp | saved receipt | D |

`POST /api/delta` runs the contradiction check itself. Callers don't.

### Discord handoff sequence

1. Fetch `GET /api/plan/handoff`. Each item is already grouped by owner and includes the final DM `message`.
2. Skip items whose `status` is `sent`; this makes polling and retries idempotent.
3. If an owner has no `discordUserId`, resolve them against the guild roster and persist the exact match with `POST /api/people/discord`. Never fuzzy-match and auto-send.
4. Send only items with a `discordUserId`, then post a `sent` or `failed` receipt to `POST /api/plan/dispatch` using the same `planId` and `ownerKey`.
5. Ask `clarificationQuestions` in the project channel. Unowned work stays visible as a handoff with no Discord identity.

The bot does not need to parse the graph or regenerate the plan. A dispatch item contains the owner, department, assignments, dates, dependencies, and ready-to-send message.

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
