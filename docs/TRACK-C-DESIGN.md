# Track C — Web shell: technical design

> Scope: [issue #4](../../issues/4). Owner: Bob Lee.
> Contracts consumed: `GET /api/team/:id` → `TeamDetail`, `POST /api/ingest` ([CONTRACT.md](../CONTRACT.md)).
> Visual and typographic spec lives in [`TRACK-C-UI.md`](TRACK-C-UI.md). This file is structure, state, and seams.

---

## 0. Three decisions that protect the demo

PLAN §5 step 5 — *"the graph on screen visibly changes"* — is the one thing being scored. Every decision below exists to keep that frame intact.

### D1 — No `/team/[id]` route. Selection lives in a search param.

An App Router navigation remounts the page subtree. That remounts Track B's `react-force-graph-2d` canvas, which restarts the d3-force simulation, which scatters every node. One click destroys the money shot.

**Single page `/`. Selection is `?team=team.engineering`.** The canvas never unmounts. Bonus: every UI state is a shareable URL, so a mid-demo crash recovers by pasting a link.

```tsx
const params = useSearchParams();
const router  = useRouter();
const selectedId = params.get('team');
const select = (id: string | null) =>
  router.replace(id ? `/?team=${id}` : '/', { scroll: false });
```

`useSearchParams()` requires a `<Suspense>` boundary in App Router or the production build fails. Wrap the page body once.

### D2 — The drawer overlays the canvas. It does not squeeze it.

Changing canvas width re-heats the force simulation — nodes drift again. Instead: canvas stays full-bleed, drawer slides over the right side, and **Track B pans the graph** so the selected node lands in the visible left portion.

```tsx
// Track B, on selection change:
const n = graphData.nodes.find(x => x.id === selectedId);
if (n) fgRef.current.centerAt(n.x + PANEL_W / (2 * zoom), n.y, 400);
```

Reads as one gesture: click → graph glides aside → panel slides in.

### D3 — Build against Track F's `seed/graph.json` only. Derive `TeamDetail` locally.

`TeamDetail` is fully derivable from `Graph`. Writing a second hand-authored fixture guarantees it drifts from the seed data, and you discover it at hour 8.

`deriveTeamDetail()` gives you three things for 25 lines: work starts before Track A ships, one fixture instead of two, and a ready-made fallback when the API fails on stage.

```ts
export function deriveTeamDetail(g: Graph, teamId: string): TeamDetail | null {
  const team = g.nodes.find(n => n.id === teamId && n.type === 'Team');
  if (!team) return null;
  const of  = (t: NodeType) => g.nodes.filter(n => n.type === t && n.teamId === teamId);
  const ids = new Set([teamId, ...g.nodes.filter(n => n.teamId === teamId).map(n => n.id)]);
  return {
    team,
    members:  of('Person'),
    tasks:    of('Task'),
    blockers: of('Blocker'),
    conflicts: g.edges.filter(e => e.type === 'CONFLICTS_WITH' && (ids.has(e.from) || ids.has(e.to))),
    // XOR — only edges that cross the team boundary
    dependencies: g.edges.filter(e => e.type === 'DEPENDS_ON' && (ids.has(e.from) !== ids.has(e.to))),
  };
}
```

---

## 1. `GraphProvider` — the one piece three tracks share

Not in issue #4, but Track C should own it. Three tracks need the same derived state:

| Need | Track | Issue |
| --- | --- | --- |
| Edges changed in the last 30s → more link particles | B | #3 |
| Rows that just changed → flash highlight | C | #4 |
| Click a signal → highlight those nodes in the graph | F | #7 |

Independent pollers means the graph and the panel show different states on stage. That is the one bug class a judge can see from the back of the room. **One poll, one context, everyone reads it.**

```tsx
interface GraphCtx {
  graph: Graph | null;
  lastSyncAt: number;
  isRecent(id: string): boolean;                    // node or edge changed < 30s ago
  selectedId: string | null;
  select(id: string | null): void;                  // B's onNodeClick calls this
  highlightIds: Set<string>;
  setHighlight(ids: string[]): void;                // F's signals page calls this
  focusRequest: { id: string; at: number } | null;  // B watches this to centerAt()
}
```

### Four things the poll must get right

```tsx
const POLL_MS = 3000, TTL = 30_000;
const prevStamp = useRef(new Map<string, string>());  // id -> updatedAt
const changedAt = useRef(new Map<string, number>());  // id -> when we saw it change

async function tick() {
  try {
    const g = await fetchGraph();
    const next = new Map<string, string>();
    const first = prevStamp.current.size === 0;
    for (const it of [...g.nodes, ...g.edges]) {
      next.set(it.id, it.updatedAt);
      if (!first && prevStamp.current.get(it.id) !== it.updatedAt) {
        changedAt.current.set(it.id, Date.now());
      }
    }
    prevStamp.current = next;
    setGraph(g);
    setLastSyncAt(Date.now());
  } catch {
    // deliberately empty: keep the last good graph on screen
  } finally {
    timer = setTimeout(tick, POLL_MS);   // chained, never setInterval
  }
}
```

1. **Chained `setTimeout`, not `setInterval`.** One slow response with `setInterval` stacks requests.
2. **Swallow errors and keep the previous graph.** A transient 500 must never blank the screen mid-demo.
3. **Skip the diff on the first snapshot**, or every node lights up as "just changed" on load.
4. **Pause when `document.hidden`.** Free, and it stops a backgrounded tab hammering the API during the pitch.

### Performance trap: do not re-render the tree every second

Relative timestamps ("2s ago") need a ticking clock, and the 30s highlight needs to decay. The obvious fix — a 1s interval on the provider — re-renders the whole app every second and makes B's canvas stutter.

Put the clock in a leaf hook so only timestamp components subscribe:

```tsx
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}
```

### Panel refresh uses the poll as its clock

Do not give the panel its own timer. Fetch `/api/team/:id` when selection changes; re-fetch only when `recentlyChanged` intersects that team's node ids. The graph and the panel then update **in the same tick** — which is precisely the moment being demoed.

---

## 2. Surfaces

Three routes, one persistent canvas.

| Route | Owner | Contents |
| --- | --- | --- |
| `/` | C | Top bar · full-bleed graph (B) · right drawer · floating legend |
| `/signals` | layout C, detection F | Ranked list of what Athena noticed |
| `/import` | C | Paste / drop text → `POST /api/ingest` → delta receipt |

### The drawer is never empty

Issue #4 only specifies the team panel. But an empty right third on first paint wastes the strongest real estate on screen, and it makes the first click feel like something appearing from nowhere.

**Nothing selected → Project Overview**: four KPI tiles (teams / open tasks / blockers / contradictions), an activity ticker, and the top three signals. **Team selected → Team Detail.** Same slot, same width, content swaps.

The real win is narrative: the presenter can tell the whole story without leaving the graph. Every navigation is a chance to lose the room.

---

## 3. Team detail panel

Ordered by *what a judge can read from four metres*, not by the shape of `TeamDetail`.

### 3.1 Header
Team name, health dot, and three numbers: `tasks · blocked · stale`. Those three numbers are the only thing that must be legible from the back row.

### 3.2 Contradictions — directly under the header, never buried

The Hidden Signals Award hook and the most photogenic component in the app. Worth thirty dedicated minutes.

**The trap, solved now so it does not surface at hour 8:** a `GraphEdge` carries *one* `sourceRef`, but the story needs *two* quotes — Engineering said X, Ops said Y. The edge's `sourceRef` is the provenance of the *detection*. The two quotes live on the two endpoint **nodes**.

```ts
export function claimOf(g: Graph, nodeId: string) {
  const n     = g.nodes.find(x => x.id === nodeId);
  const owner = n?.ownerId ? g.nodes.find(x => x.id === n.ownerId) : undefined;
  const team  = n?.teamId  ? g.nodes.find(x => x.id === n.teamId)  : undefined;
  return {
    who:   owner?.label ?? team?.label ?? 'Unattributed',
    quote: n?.sourceRef?.quote,
    kind:  n?.sourceRef?.kind,
    at:    n?.updatedAt,
  };
}
```

**No contract change required.** Render as a two-column "he said / she said" block, each side carrying attribution, timestamp and source badge.

### 3.3 AI summary
Marked as AI-written, with an Athena glyph and an accent rule down the left edge. Labelling it honestly costs nothing and scores on responsibility — it shows you separated *what the model wrote* from *what a human said*.

### 3.4 Tasks — sorted by severity, never alphabetically

The top of the list should always be the interesting part.

```ts
const RANK: Record<Status, number> = { blocked: 0, at_risk: 1, in_progress: 2, not_started: 3, done: 4 };
tasks.sort((a, b) =>
  (RANK[a.status ?? 'not_started'] - RANK[b.status ?? 'not_started']) ||
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
```

Each row: status pill · title · owner · due date · freshness · source badge.
**An unowned task renders a dashed "unowned" slot**, not a blank. Showing the gap is the point — it feeds Track F's signal narrative and it is a thing the presenter can point at.

### 3.5 Dependencies
Cross-boundary `DEPENDS_ON` edges as clickable chips — `Engineering → waiting on → Legal`. Clicking moves the panel to that team and highlights the edge in the graph.

### 3.6 Members
Section heading is **"Who owns what"**, not "Team activity".

PLAN §10 promises this is not surveillance. Wording is the only place in the UI where that promise is actually kept, and it is a line the presenter can deliver while pointing at the screen.

---

## 4. Traceability and freshness

Both are explicit judging criteria dressed as UI details. Neither is polish.

### Freshness

```ts
export type Freshness = 'live' | 'fresh' | 'aging' | 'stale';
export function freshness(iso: string, now = Date.now()): Freshness {
  const m = (now - Date.parse(iso)) / 60_000;
  return m < 2 ? 'live' : m < 360 ? 'fresh' : m < 1440 ? 'aging' : 'stale';
}
```

Freshness is expressed **on the timestamp chip** — colour and fill — not by fading the row. Decaying opacity is a tempting metaphor (information decay is literally the product thesis) but faded text is unreadable on a projector. The chip carries the signal; the text stays at full contrast.

> ⚠️ **Coordination item for Tracks A and F — raise this in the channel now.**
> Seed `updatedAt` values must be generated **relative to `now` at seed time**, not hard-coded ISO strings. Otherwise every node is `stale` by Saturday morning, the entire freshness system reads as broken, and nobody notices until the rehearsal.

### Source

Every fact carries a badge: `SEED` · `DOC` · `DM`. **Click to open a popover, not hover** — a presenter's mouse is jittery and hover tooltips flicker on a projector. The popover shows the source kind, the verbatim quote, the ref, and the timestamp.

When `sourceRef` is missing, render an explicit muted **"unsourced"**. Do not hide it. Showing coverage gaps is more credible than implying completeness, and it is another of Track F's signals.

---

## 5. Import page

This is where Track C earns the **Generality** criterion. The brief lists pull requests, whiteboard photos, recordings, documents, PDFs, spreadsheets, raw data.

- Large textarea; `.txt` / `.md` drag-and-drop via `FileReader` (~15 lines). **PDF parsing is explicitly out of scope** — say so in the placeholder rather than failing silently.
- **Four example chips** — `Meeting notes` · `PR description` · `Spec excerpt` · `Slack export` — each fills the textarea with a canned sample. Zero backend cost, demonstrates "any content type", and removes live typing from the demo.
- **Delta receipt, not an "ok".** Group the result: `+ New · Task · retention-window-review`, `~ Updated · Team · Legal`. Then one CTA — **"See it in the graph"** → navigate to `/`, `setHighlight(newIds)`, graph pans and pulses.
- Failure state shows the error; under `?mock=1` it applies a canned delta so the page still demos.

A form becomes a demo beat.

---

## 6. Seams

| Seam | Direction | Interface |
| --- | --- | --- |
| Node click | B → C | `select(id)` from `useGraph()` |
| Camera | C → B | B watches `focusRequest`, calls `centerAt` |
| Recency | C → B | `isRecent(edgeId)` → raise `linkDirectionalParticles` |
| Palette | C → B | `import { STATUS_COLOR } from '@/lib/theme'` |
| Signals | F → C | `detectSignals(graph): Signal[]` — a pure function C imports |
| Highlight | F → C → B | `setHighlight(ids)` |
| Detail | A → C | `GET /api/team/:id`, with `deriveTeamDetail()` as fallback |
| Ingest | C → A | `POST /api/ingest` |

**Four visual channels, agreed with Track B, no collisions:**

| Channel | Meaning |
| --- | --- |
| Node fill | `status` (health) |
| Ring, accent violet | currently selected |
| Outer glow pulse, cyan | changed in the last 30s |
| Dim to 35% | filtered out by a signal |

`Signal` needs to enter CONTRACT. Per CONTRACT rule 3, post in the channel and get a 👍 before adding it.

---

## 7. `?mock=1` — the same discipline CONTRACT demands of Track E

Every fetch goes through `lib/api.ts` behind a `USE_FIXTURES` flag (env var or URL param). Under the flag, reads come from `seed/graph.json` and writes are simulated.

Two payoffs. **During the build:** Track C is never blocked by Track A. **On stage:** if the API dies, append `?mock=1` and the entire UI keeps running.

> If mock mode is ever used in front of judges, say so — same rule as the backup recording. Announcing it costs nothing; being caught costs everything.

**Keyboard shortcuts** — `g` graph · `s` signals · `i` import · `Esc` close panel · `?` legend. About twenty lines, and the presenter never fumbles for the mouse.

---

## 8. File layout

```
app/
  layout.tsx           # fonts, GraphProvider, dark shell
  page.tsx             # <NeuronGraph/> (B) + <Drawer/>          ← C owns the page
  signals/page.tsx     # layout by C, detectSignals by F
  import/page.tsx
components/
  shell/     TopBar  Legend  SyncPulse  ShortcutLayer
  panel/     Drawer  TeamPanel  OverviewPanel  ContradictionCard
             AiSummary  TaskRow  MemberRow  DependencyChip  ActivityTicker
  ui/        StatusPill  FreshnessChip  SourceBadge  SourcePopover
             Card  Empty  Skeleton  KpiTile  Avatar
lib/
  theme.ts             # palette + STATUS_COLOR — Track B imports this
  api.ts               # fetchers + USE_FIXTURES
  useGraph.tsx         # GraphProvider
  derive.ts            # deriveTeamDetail / claimOf / task sort
  time.ts              # freshness / relativeTime / useNow
  fixtures/graph.json  # Track F's seed, verbatim
```

Two Next.js traps, twenty minutes each if you hit them cold:

```tsx
// react-force-graph touches window at import time
const NeuronGraph = dynamic(() => import('@/components/graph/NeuronGraph'), { ssr: false });
```

`useSearchParams()` without a `<Suspense>` boundary fails the production build, not the dev server. You find out while deploying.

---

## 9. Build order

`T+0` is when Track C starts.

| Window | Deliverable |
| --- | --- |
| T+0:00–0:20 | Agree in channel who runs `create-next-app`. Then `theme.ts`, fonts, `TopBar`. |
| **T+0:20–1:30** | **`TeamPanel` on fixtures — the issue's 90-minute deliverable.** Header, status pills, task list, contradiction card. |
| T+1:30–2:15 | `GraphProvider`, selection wiring. **Post the context API in the channel for B and F.** |
| T+2:15–3:00 | Source popover, freshness system |
| T+3:00–3:45 | Import page, example chips, delta receipt |
| T+3:45–4:30 | Overview panel, activity ticker |
| T+4:30–5:15 | Signals page layout, handed to F |
| **Hour 6** | Integration checkpoint — turn `USE_FIXTURES` off, wire real routes |
| Sat AM | Projector pass at 1280×720, change-flash, keyboard, empty states, reduced motion |

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Track A's API is late or absent | Fixtures + `?mock=1`. **Hard rule: Track C never blocks.** |
| B's canvas remounts when the panel opens | D1 and D2 — no routing, no squeeze |
| Graph and panel disagree on stage | One `GraphProvider` poll |
| `TeamDetail` comes back with missing fields | `normalize()` with `?? []` per array — one line each, saves the demo |
| Panel too dense to read from the back | Enforce "three things legible at four metres". Cut content, never type size. |
| Seed timestamps hard-coded → everything stale | Raise with A and F now (§4) |

---

## 11. Definition of done

1. Clicking any team node pans the graph and slides the panel in over 220ms — **the graph does not re-layout**
2. Every fact in the panel opens its verbatim source quote
3. When a Discord reply lands, graph and panel change **in the same 3s tick**, and the changed row flashes
4. A team with a contradiction shows the dual-quote card directly under the header, legible from the back row
5. Pasting meeting notes into `/import` produces a delta receipt and one click returns to the graph with the new nodes highlighted
6. Readable at 1280×720 from four metres
7. `?mock=1` runs the entire app with no backend
