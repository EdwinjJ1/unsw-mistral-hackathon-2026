# PLAN — Athena

> **Name: *Athena*.** Decided — stop debating it. In the *Odyssey* she doesn't wait to be consulted: she appears to Telemachus disguised as an old friend named **Mentor** and tells him what to do and who to go talk to. (That disguise is where the English word *mentor* comes from.) She is also the goddess of *strategic* war, as opposed to Ares and brute force — **she wins by seeing the whole board.** Both halves of the product, in one name. Use the Mentor line in the pitch.
>
> **Time budget:** it is Fri 31 Jul. Submission is **Sat 1 Aug 12:00**. That is roughly **12–14 real working hours** after sleep, food, and setup. Every decision below is made under that constraint.

---

## 1. The idea in one sentence

**Athena is a second brain for a project — a living knowledge graph of teams, people, and tasks — with a Discord bot that reads the graph, DMs each person exactly what they own and who they need to talk to, chases them for updates, and writes their replies straight back into the graph.**

## 2. Persona and pain

**Persona:** the project lead / PM on a multi-disciplinary team (design + engineering + product + ops + legal).

**The pain — two halves that make each other worse:**

| Half | What actually happens |
| --- | --- |
| **Information decay** | The project's real state lives scattered across Discord threads, docs, tickets, and people's heads. By the time anyone reconciles it, it is already stale. |
| **The social tax on chasing** | Someone *has* to keep asking "hey, is that done yet?" — across teams, repeatedly. Nobody wants to be that person. It reads as nagging, it costs social capital, so it does not happen, so the information decays further. |

**The insight — this is the pitch's hook:**

> Every team already knows they should chase status. They do not, because chasing has a **social cost**, not a technical one. Existing tools (Jira, Notion, standups) fix the *storage* problem and ignore the *asking* problem — they are passive: they wait for humans to update them, which is exactly the step that fails.
>
> A bot pays no social cost. It can ask the same person the same question five times without resentment, ask across team boundaries without politics, and it does it at 100% coverage in real time. **Athena makes the graph active: it goes out and gets the information instead of waiting for it.**

## 3. The product

### 3.1 The brain (web app)

An Obsidian-style force-directed graph — nodes as neurons, edges as synapses.

- **Big nodes = teams.** Node size reflects workload; colour reflects health (green / amber / red).
- **Click a team node → it expands.** A detail view slides in with:
  - AI summary of what this team is actually doing right now
  - Project status and per-task status
  - Members, owners, deadlines
  - Blockers and cross-team dependencies
  - Last update timestamp per fact ("freshness")
- **Inside a team node, sub-nodes** = people and tasks; edges cross team boundaries to show dependencies.
- **Live**: when the bot writes an update, the graph animates the change. This is the demo moment — do not skip it.

**Two-surface design:** main graph = the whole project at a glance; expanded panel = the drill-down. Whether the panel is a route (`/team/:id`) or an overlay is the frontend owner's call — pick whichever is faster and looks better on a projector.

### 3.2 The bot (Discord)

The graph is the source of truth. The bot is its hands.

| Behaviour | Detail |
| --- | --- |
| **Assign** | Reads the graph, DMs each person their tasks in plain language |
| **Direct** | Tells them *who to talk to and what to confirm* — e.g. "check the 14-day vs 30-day undo window with @design before you build it". This comes from graph edges, not from vibes. |
| **Chase** | Periodic DM check-ins: "how's X going? blocked on anything?" |
| **Absorb** | Parses the reply, extracts the useful signal, discards chit-chat, writes a delta back into the graph |
| **Close the loop** | The graph updates → the next round of DMs reflects the new state |

### 3.3 The Hidden Signal (award hook — build this, it is cheap and it wins points)

Because every team's answers land in one graph, Athena sees what no single person sees: **contradictions between what two teams believe.**

> Engineering DMs "auth is done, shipped Thursday."
> Ops DMs "still waiting on auth, we're blocked."
>
> Both were true to the person who said them. Neither would have been discovered in a standup. Athena flags the contradiction, shows both sources, and DMs both owners with one clarifying question.

Implement as: on every graph write, run a conflict check against related nodes. One extra Mistral call. Huge narrative payoff.

## 4. Architecture

```
 Discord DMs  ──►  Bot (discord.js)  ──►  Mistral pipeline  ──►  Graph store (SQLite)
      ▲                                          │                       │
      └──────────  outbound DMs  ◄───────────────┘                       │
                                                                         ▼
                                            Web app (Next.js + force-graph)  ◄── live updates
```

**Layers**

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js + React + `react-force-graph-2d` | See §4.3 — closest thing to Obsidian's look, out of the box |
| Backend/API | Next.js API routes | One deploy, no separate server |
| Bot | `discord.js` v14, same repo | Shares the graph types with the frontend |
| Store | **SQLite** (`better-sqlite3`), nodes + edges tables | Zero setup, file-backed, survives restarts. Not Postgres — no time. |
| AI | **Mistral API only** | Mandatory. No OpenAI, no Anthropic, anywhere in this repo. |
| Live update | Poll every 3s | Boring and reliable. Do **not** build websockets. |

**Language decision: TypeScript everywhere.** Frontend, bot, and API share one `Graph` type. Do not split Python bot + TS frontend — the integration cost will eat an hour you do not have.

### 4.1 Data model

**Nodes:** `Team` · `Person` · `Task` · `Decision` · `Blocker`
**Edges:** `MEMBER_OF` · `OWNS` · `DEPENDS_ON` · `BLOCKS` · `CONFLICTS_WITH` · `SOURCED_FROM`

Every node carries `status`, `updatedAt`, and `sourceRef` (which DM / doc it came from). **`sourceRef` is not optional** — "AI should support human thinking, not replace it" is a judging criterion, and traceability is how you demonstrate it. Every claim in the UI must be clickable back to its source.

### 4.2 Mistral usage — specialised calls, not one giant prompt

This is an explicit hackathon requirement. Five small, purposeful calls:

| # | Job | Model | Notes |
| --- | --- | --- | --- |
| 1 | Triage a DM reply: status update / blocker / question / noise | `mistral-small` | Cheap gate; ~80% of replies stop here |
| 2 | Extract a structured graph delta from the reply | `mistral-large` | JSON / structured output mode. Strict schema. |
| 3 | Compose the outbound DM (task + who to talk to + tone) | `mistral-large` | Reads the person's subgraph |
| 4 | Semantic linking / dedupe across teams | `mistral-embed` | "auth service" ≈ "login backend" |
| 5 | Cross-team contradiction detection | `mistral-large` | The Hidden Signal |
| 6 | *Stretch:* whiteboard photo → nodes | `pixtral` | Only if everything else is done |

Confirm exact model IDs against Mistral's current docs before coding — do not trust this table blindly.

### 4.3 Getting the Obsidian / neuron look

Obsidian's own graph view is **d3-force** for the physics plus **PIXI.js** for rendering. Do not rebuild that from scratch.

Use **[`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph)** (vasturiano). Canvas-based, d3-force under the hood, React-native API, handles a few thousand nodes without effort. It is the shortest path from zero to something that looks like Obsidian.

The single prop that sells the neuron aesthetic:

```jsx
linkDirectionalParticles={2}
linkDirectionalParticleSpeed={0.006}
linkDirectionalParticleWidth={2}
```

That animates dots travelling along each edge — reads exactly like **impulses firing along a synapse**. Without it you have a generic node graph; with it you have a brain. Turn particle count *up* on edges the bot just touched and the live update becomes visually obvious to judges at the back of the room.

Other settings worth the two minutes: dark background, `nodeVal` bound to workload, `nodeCanvasObject` for a soft radial-gradient glow behind each node, `d3VelocityDecay` around `0.3` so it settles instead of jittering.

**Alternatives, and why not:** `cytoscape.js` (structured/orthogonal layouts, wrong aesthetic) · `sigma.js` (WebGL, built for 100k+ nodes, more setup than you need) · raw `d3-force` (you'd write the render loop yourself) · `vis-network` (dated look).

**Timebox this to two hours.** Force-graph physics tuning is the single most seductive rabbit hole in this build.

## 5. MVP — the only thing that must work

**One complete loop, demoed live:**

1. Graph is pre-seeded with a realistic 4-team project (see §7).
2. Bot DMs a person: *"You own the rollback runbook, due tomorrow. Confirm the retention window with @legal first."*
3. That person (a teammate, live on stage) replies in Discord: *"runbook's done, but legal never got back to me — blocked."*
4. Mistral extracts the delta → task goes green, a new `Blocker` node appears, edge to Legal.
5. **The graph on screen visibly changes.**
6. Contradiction fires: Legal's earlier reply said "all approvals cleared." Athena flags it and shows both sources.

If only this works, the project is submittable. Everything else is decoration.

**Explicitly out of scope:** auth/login, multi-project support, real Jira/Atlassian sync, mobile, websockets, deployment to a real domain, tests beyond smoke tests.

## 6. Workstreams — six people, six tracks

Everything below is built against [`CONTRACT.md`](CONTRACT.md). **Read it before you write a line.** Claim your track in the README team table now.

| Track | Owns | First deliverable (aim: 90 min) |
| --- | --- | --- |
| **A — Graph core** | SQLite schema, the types from CONTRACT §1 as real code, all five API routes, `applyDelta()` | `GET /api/graph` returning seeded JSON. **Ship this first — four people are waiting on it.** |
| **B — Neuron graph** | The force-directed brain view: node sizing, health colours, link particles, click-to-select | The graph rendering from a hardcoded JSON file, looking like neurons |
| **C — Web shell** | Pages and routing, team detail panel, import page, layout and styling | Detail panel rendering a hardcoded `TeamDetail` |
| **D — Discord bot** | Bot registration, DM send/receive, check-in scheduler, wiring replies into `POST /api/delta` | **A bot that DMs "hello" and logs your reply. Do this in hour 0** |
| **E — Mistral lib** | `lib/mistral/` — all five functions from CONTRACT §4, prompts, JSON schemas, fallbacks | `extractDelta()` turning a hardcoded reply string into a valid `Delta` |
| **F — Demo & pitch** | Seed dataset, demo script, deck, backup recording, submission text — **and integration fixer** | The seed dataset, handed to A. Then float and unblock. |

**B and C are deliberately separate people.** The force-graph is a physics-tuning rabbit hole; the rest of the app is CRUD-shaped work. One person doing both means the app shell never gets finished.

**F is not a spare person.** Someone must own the demo dataset (which everyone builds against), the pitch, and — critically — being the one who notices at hour 6 that D and A disagree about a field name. On a six-person team this role pays for itself.

**Rule: everyone starts against fake data.** Nobody waits for anybody. Integrate at the halfway mark, not at the end.

### Dependency order

```
A (graph core) ──┬──► B (graph view)      polls GET /api/graph
                 ├──► C (web shell)       calls GET /api/team/:id
                 ├──► D (bot)             calls POST /api/delta
                 └──► E (mistral lib)     produces Delta objects

F (seed data) ───► A     ... then F floats across everyone
```

Only **A** is on the critical path. If A slips, everything slips — so A does the schema and routes *first* and the fancy query logic never.

## 7. Demo data

Seed a fictional but believable project — a product launch with **Product, Engineering, Design, Legal/Ops**. Plant three things deliberately:

1. One task with a genuine cross-team dependency (the DM instruction comes from this).
2. One contradiction between two teams (the Hidden Signal).
3. One unowned task (nobody assigned — the bot spots the gap).

Write this seed data **early**. A good demo dataset is worth more than an extra feature.

## 8. Timeline

| Slot | Goal |
| --- | --- |
| Hour 0–1 | Decide name, stack, Discord server + bot token, Mistral API key, repo skeleton, everyone can run it |
| Hour 1–4 | Four tracks in parallel against fake data |
| Hour 4–6 | **Integrate**: bot writes a real delta into the real graph, UI shows it |
| Hour 6–8 | Contradiction detection + seed data polish |
| Sleep | Actually sleep. Do not skip. |
| Sat morning | Visual polish, demo rehearsal ×3, **record the backup video**, write submission text |
| Sat 11:00 | Hard freeze. No new features. |
| Sat 12:00 | Submit |

**Record the backup demo video by 10:00 Saturday.** Live demos fail; conference wifi fails; Discord rate-limits. The recording is insurance, and it is also the thing you will be glad you made when you are tired.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Discord bot setup burns 3 hours | Start it in hour 0. It is the single most likely time sink. |
| Mistral structured output is flaky | Strict JSON schema + retry + a hardcoded fallback delta for the demo path |
| Graph UI turns into a physics-tuning rabbit hole | Timebox to 2 hours. A readable static-ish layout beats a beautiful unfinished one. |
| Scope creep | §5 is the contract. Anything not in §5 needs the whole team to agree before anyone starts it. |
| Live demo dies on stage | The recording from §8 |

## 10. Guardrails to mention in the pitch

Judges score responsibility explicitly, and a bot that reads DMs and tracks people invites obvious questions. Have answers ready:

- **Consent:** people opt in; the bot introduces itself and what it stores on first contact.
- **Visible memory:** anyone can ask the bot what it knows about them; every fact is traceable to a source.
- **Not surveillance:** it tracks *task state*, not people's productivity. Never surface "who is slow" — that is the version of this product that deserves to fail, and saying so out loud shows judges you thought about it.
- **Human in the loop:** the bot proposes and asks; it never silently reassigns work or makes decisions.
- **Data:** DM content stays in the project store, is not used for training, and is deletable on request.
