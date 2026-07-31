# Athena

**A second brain for your project — and a bot that actually chases people for updates.**

Built for the **UNSW × Mistral AI × Atlassian Hackathon 2026**.

> 📋 **Team: read [`PLAN.md`](PLAN.md) before writing any code.** It has the scope, the architecture, the workstream you own, and the timeline. This README is the summary; PLAN.md is the contract.

---

## The problem

Multi-disciplinary teams do not fail because information does not exist. They fail because:

1. **Information decays.** The project's real state is scattered across Discord, docs, tickets, and heads. By the time anyone reconciles it, it is stale.
2. **Nobody wants to be the person who chases.** Asking "is that done yet?" — repeatedly, across teams — has a *social* cost. So it does not happen. So the information decays further.

Jira and Notion solve storage. They are **passive**: they wait for humans to update them, which is precisely the step that fails.

## The idea

**A bot pays no social cost.** It can ask the same person the same question five times without resentment, cross team boundaries without politics, and do it at full coverage in real time.

Athena is two halves of one loop:

### 🧠 The brain

An Obsidian-style force-directed knowledge graph. Nodes are neurons, edges are synapses.

- **Big nodes = teams.** Size = workload, colour = health.
- **Click a node → it expands** into a detail view: AI summary, project status, task status, owners, deadlines, blockers, cross-team dependencies, and how fresh each fact is.
- Sub-nodes inside each team are people and tasks; edges cross team boundaries to show what depends on what.
- **It moves.** When the bot learns something, the graph visibly updates.

### 🤖 The bot

A Discord bot that treats the graph as the source of truth and acts as its hands:

| | |
| --- | --- |
| **Assigns** | DMs each person the work they own, in plain language |
| **Directs** | Tells them who to talk to and what to confirm — read from graph edges, not guessed |
| **Chases** | Periodic DM check-ins on progress and blockers |
| **Absorbs** | Extracts the real signal from the reply, drops the chit-chat, writes a delta back to the graph |

The graph updates → the next round of DMs reflects the new state. The loop closes.

## Why "Athena"

In the *Odyssey*, Athena doesn't sit in a temple waiting to be consulted. She **shows up**. She appears to Telemachus disguised as an old family friend named **Mentor**, tells him what he should be doing and who he needs to go talk to, and pushes him to actually do it. The English word *mentor* comes from that disguise.

She is also the goddess of ***strategic*** war — as opposed to Ares and brute force. **She wins by seeing the whole board**, which is the view no individual player has. That's the graph.

Both halves of the product, in one name.

> **Pitch line:** *"Athena appeared to heroes disguised as Mentor and told them who to go talk to. We built her as a Discord bot."*

## 🔍 The hidden signal

Because every team's answers land in **one** graph, Athena sees what no individual can:

> **Engineering:** "auth is done, shipped Thursday."
> **Ops:** "still waiting on auth, we're blocked."

Both people were telling the truth as they understood it. Neither contradiction would surface in a standup. Athena flags it, shows both sources, and asks both owners one clarifying question.

*This is the [Hidden Signals Award](#judging-criteria) hook.*

## Architecture

```
 Discord DMs  ──►  Bot (discord.js)  ──►  Mistral pipeline  ──►  Graph store (SQLite)
      ▲                                          │                       │
      └──────────  outbound DMs  ◄───────────────┘                       │
                                                                         ▼
                                            Web app (Next.js + force-graph)  ◄── live updates
```

TypeScript end to end so the frontend, bot, and API share one `Graph` type. Details and rationale in [`PLAN.md` §4](PLAN.md).

### Mistral usage

Six specialised calls, not one giant prompt — an explicit hackathon requirement:

| Job | Model |
| --- | --- |
| Triage a DM reply (update / blocker / question / noise) | `mistral-small` |
| Extract a structured graph delta | `mistral-large` |
| Compose the outbound DM | `mistral-large` |
| Semantic linking across teams | `mistral-embed` |
| Cross-team contradiction detection | `mistral-large` |
| *Stretch:* whiteboard photo → nodes | `pixtral` |

> ⚠️ **No OpenAI or Anthropic APIs anywhere in this repo.** It is a hard disqualifier.

## The demo (this is what gets scored)

One complete loop, live:

1. Graph is seeded with a realistic 4-team product launch.
2. Bot DMs someone: *"You own the rollback runbook, due tomorrow. Confirm the retention window with @legal first."*
3. They reply in Discord: *"runbook's done, but legal never got back to me — blocked."*
4. Mistral extracts the delta → task turns green, a `Blocker` node appears, edge to Legal.
5. **The graph on screen changes in front of the judges.**
6. Contradiction fires: Legal said "all approvals cleared." Athena flags it with both sources.

## Repository layout

```
.
├── README.md      # What we're building and why — start here
├── PLAN.md        # Scope, architecture, workstreams, timeline, risks
└── CONTRACT.md    # Types + API shape. Read before writing code. Do not change alone.
```

Code layout lands once Track A ships the graph core.

## Team

Six people, six tracks. Put your name in and claim one. Full scope per track in [`PLAN.md` §6](PLAN.md).

| Name | Track | Owns |
| --- | --- | --- |
| _TBD_ | **A — Graph core** | SQLite, types, all API routes, `applyDelta()` |
| _TBD_ | **B — Neuron graph** | The force-directed brain view: sizing, colours, link particles |
| _TBD_ | **C — Web shell** | Pages, routing, team detail panel, import page, styling |
| _TBD_ | **D — Discord bot** | Bot setup, DM send/receive, check-in scheduler |
| _TBD_ | **E — Mistral lib** | The five calls, prompts, JSON schemas, fallbacks |
| _TBD_ | **F — Demo & pitch** | Seed data, demo script, deck, backup recording, integration fixing |

**Everyone starts against fake data. Nobody waits for anybody.** Integrate at the halfway mark, not at the end.

Only **A** is on the critical path — four tracks consume its API. A ships schema and routes first, clever query logic never.

## Getting started

Skeleton lands with Track A. Right now, in this order:

1. **Everyone: read [`CONTRACT.md`](CONTRACT.md) and agree on it.** 20 minutes, whole team, before any code. Six people building against six different node shapes is the only realistic way this fails.
2. Claim a track in the table above.
3. **Track D: start the Discord bot registration immediately.** It is the most likely time sink of the entire build.
4. Track F: write the seed dataset and hand it to A. Everyone builds against it.

> 🔐 This repo is **public**. Never commit API keys, tokens, `.env` files, or real personal data. `.gitignore` covers the obvious cases — it is not a safety net you should test.

> 🔐 This repo is **public**. Never commit API keys, tokens, `.env` files, or real personal data. `.gitignore` covers the obvious cases — it is not a safety net you should test.

## Judging criteria

**Challenge-specific:** Relevance · Usefulness · Generality · **Hidden Signals Award**

**General:** Value & human insight · Creativity & design · Feasibility & scalability · Technical execution · Use of AI (support human thinking, don't replace it)

Responsibility is scored explicitly, and a bot that DMs people and remembers what they say invites obvious questions. Our answers are in [`PLAN.md` §10](PLAN.md) — know them before the pitch.

## Schedule

| When | What |
| --- | --- |
| Fri 31 Jul | Problem reveal, hacking begins |
| **Sat 1 Aug, 10:00** | **Backup demo video recorded** — non-negotiable |
| Sat 1 Aug, 11:00 | Hard feature freeze |
| **Sat 1 Aug, 12:00** | **Submission due** |
| Sat 1 Aug, 16:00 | Winners announced |

Check times against the latest official announcement.
