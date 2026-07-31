# How Athena works, and what each of us is building

Read this once, all the way through, before you start. It takes about ten minutes and it will save you from building something that doesn't fit with what the person next to you is building.

Everyone owns one module, but everyone should understand all six. When your piece breaks at hour nine, the person who can help you is the one who understood the whole shape.

---

## Part 1 — What we are actually building

Athena is a project's memory that goes out and refreshes itself.

Think about how a real multi-disciplinary team works. Product knows some things. Engineering knows some other things. Design and Legal each know a third and fourth set. None of them is wrong, and none of them has the full picture. The full picture only exists if somebody goes around and asks everyone, and then reconciles what they said.

Nobody does that. Not because it's hard, but because asking is socially expensive. Chasing people for status makes you the annoying one. So it doesn't happen, the shared picture goes stale, and two weeks later somebody discovers that Engineering shipped a thing Ops was still waiting for.

Athena is two pieces that solve the two halves of this:

**A knowledge graph** — one structured picture of the whole project. Teams, people, tasks, blockers, and the connections between them. This is the "second brain." It's what the web app draws as a neuron-like graph.

**A Discord bot** — the part that keeps the graph true. It reads the graph, works out who owns what, DMs each person their work along with who they need to talk to, checks in on progress, and writes whatever it learns from their replies back into the graph.

The bot is not a chatbot you go and consult. That distinction is the whole idea. Jira and Notion are passive: they sit there and wait for humans to update them, which is exactly the step that fails. Athena is active. It comes to you.

And because every person's answers land in one graph, Athena can see something no individual can: **when two teams believe contradictory things.** Engineering says auth shipped. Ops says they're still blocked on auth. Both people were telling the truth as they understood it. Nobody would have caught it in a standup. Athena catches it, flags it, and asks both owners one clarifying question. That's the "hidden signal" the hackathon has an award for, and it falls out of the architecture almost for free.

---

## Part 2 — How data actually moves

This is the mental model. If you understand this section you understand the system.

**The graph is the single source of truth.** Everything else either reads from it or writes to it. Nothing keeps its own private copy of project state.

There is exactly one way to change the graph: something produces a **`Delta`** — a small object saying "create or update these nodes, create or update these edges, delete these" — and posts it to `POST /api/delta`. The bot produces Deltas. The document import produces Deltas. The contradiction checker produces Deltas. They all go through the same door.

There are three ways information gets into the system:

**Seeding.** We load a starting dataset so there's a project to look at. In the demo this is a fictional product launch.

**Importing.** Someone pastes a document or notes into the import page. Mistral reads it and turns it into nodes and edges — that's `generateGraphFromText`.

**The bot.** This is the interesting one and it's the demo. It runs a loop:

1. The bot looks at a person's slice of the graph — their tasks, their deadlines, and crucially the *edges* leading out to other teams.
2. It composes a DM from that. Not a generic "any updates?", but "you own the rollback runbook, it's due tomorrow, and you need to confirm the retention window with Legal before you build it." The "who to talk to" part is read from a `DEPENDS_ON` edge in the graph. It isn't guessed.
3. The person replies in Discord, in normal human language.
4. A cheap model call triages the reply — is this a real status update, a blocker, a question, or just chat? Most replies stop here, which keeps us fast and cheap.
5. If it's real, a second call converts it into a `Delta`. "Runbook's done but legal never got back to me" becomes: task status → `done`, new `Blocker` node, edge from that blocker to Legal.
6. That `Delta` is posted. The graph changes.
7. Posting a `Delta` automatically runs the contradiction check against everything related. If Legal said something incompatible earlier, a `CONFLICTS_WITH` edge appears with a one-line note explaining the clash.
8. The web app is polling every three seconds, so the graph on screen visibly updates — a node changes colour, a new edge appears.
9. The next round of DMs is composed from the *new* state. The loop closes.

Step 8 is the moment that wins or loses the demo. Everything we're building exists to make that visible change happen in front of judges.

One rule that runs through all of this: **every fact carries a `sourceRef` — where it came from.** The Discord message id, the sentence it was derived from, or the seed file. A judging criterion says AI should support human thinking rather than replace it, and traceability is how we demonstrate that. Every claim in the UI can be traced back to the sentence a human actually wrote. Don't treat this as optional polish.

---

## Part 3 — The six modules

### The graph core

This is the foundation and the only thing on the critical path. It's a SQLite database with two tables — nodes and edges — plus the functions that read and write them, plus five HTTP routes that everyone else calls.

Its job is unglamorous and essential: define the shared types in real code, store things, and apply Deltas correctly. "Correctly" mostly means one thing — upserting by id rather than inserting blindly, so that when the bot learns about a task that already exists, it updates that task instead of creating a duplicate.

Everything else in the system is a client of this module. Four people are blocked until its first route responds. It ships first and it ships boring.

### The neuron graph

The force-directed brain view — the thing people will remember. Nodes float and repel each other, edges pull them together, and the whole thing settles into an organic layout that looks like a neural network rather than an org chart.

Its job is to make the state of the project legible at a glance: bigger nodes for teams carrying more work, colour for health, and animated particles travelling along the edges so it reads as a living brain with signals firing rather than a static diagram. When the bot updates something, this view is what makes that update *visible*.

It reads from one endpoint and renders. It never writes.

### The web shell

Everything around the graph: the page layout, the routing, the panel that opens when you click a team, and the import page.

Its job is drill-down. The graph shows you the whole project at once but can't show detail. Click a team node and this module shows you what that team is actually doing — an AI-written summary, the task list with statuses, who owns what, deadlines, what's blocking them, what they depend on from other teams, how fresh each piece of information is, and any contradictions involving them.

This is deliberately a different person from the neuron graph. The graph view is a physics-tuning rabbit hole with no natural end; the shell is steady interface work. One person doing both means the shell never gets finished, and the shell is where the actual information lives.

### The Discord bot

The hands. It's the only part of the system that touches a human being.

Its job is the loop from Part 2: read a person's subgraph, compose and send a DM, listen for the reply, run it through triage and extraction, and post the resulting `Delta`. It also runs the check-in schedule, and it exposes a manual trigger so we can fire a DM on demand during the demo instead of waiting for a timer.

The bot holds no state of its own. Everything it knows comes from the graph, and everything it learns goes back to the graph. If you find yourself wanting to cache something in the bot, that's a sign the graph is missing a field.

This module has by far the worst setup cost — Discord app registration, permissions, intents, invite scopes — and it's all front-loaded. That's why it starts before anything else.

### The Mistral layer

Every AI call in the project lives in one folder, and nothing outside that folder imports the Mistral SDK. That gives us one place for the API key, one place for retries, and one place to fix a prompt when it misbehaves at hour ten.

There are five jobs, and they are deliberately five separate calls rather than one big prompt. This is partly a hackathon requirement and partly just correct: a small cheap model can triage a message, and only the ones that matter need a larger model to extract structure from.

- **Triage** — is this reply a status update, a blocker, a question, or noise? Cheap gate, most replies stop here.
- **Extraction** — turn a human sentence into a structured `Delta`.
- **Composition** — write the outbound DM from a person's subgraph.
- **Ingestion** — turn a pasted document into a graph.
- **Contradiction detection** — compare what just changed against related nodes and report clashes.

Two rules matter more than prompt cleverness. **Always pass the existing node ids as context**, so the model updates what's there instead of inventing a parallel copy of it. And **every function needs a hardcoded fallback** — if a Mistral call fails while we're on stage, the demo has to keep moving. Write the fallback when you write the function.

Prompts should frame the scope and pass a schema, and then stop. Two or three sentences. If a prompt is getting longer than the function that calls it, it should have been two calls.

### Demo and pitch

Not the spare seat. This module owns three things that decide whether the other five matter.

**The seed dataset.** A believable fictional project that everyone develops against. It has to deliberately contain a cross-team dependency (so the bot has something real to say about who to talk to), a contradiction between two teams (so the hidden-signal feature has something to find), and an unowned task (so the bot can spot a gap). This blocks four people, so it comes first. A good demo dataset is worth more than an extra feature.

**The pitch and the recording.** The narrative, the deck, the rehearsals, and a recorded backup demo. Judges can only score what they see working, and live demos fail — venue wifi, rate limits, a service having a bad afternoon. The recording is insurance.

**Integration.** Someone has to be the person who notices at hour six that the bot and the API disagree about a field name. On a six-person team that role pays for itself several times over.

---

## Part 4 — Where the modules meet

These are the seams. Every one of them is a place where two people can independently build something reasonable and still be incompatible, so they're all pinned down in `CONTRACT.md`.

| Seam | Who | What passes through |
| --- | --- | --- |
| Graph read | core → neuron graph | The whole `Graph`, polled every 3 seconds |
| Detail read | core → web shell | A `TeamDetail` for one team |
| Person read | core → bot | One person's subgraph, so the bot can compose a DM |
| Graph write | bot, Mistral layer → core | A `Delta`. This is the only way anything changes. |
| Ingest | web shell → core → Mistral layer | Raw text in, applied `Delta` out |
| Selection | neuron graph → web shell | A node id, when someone clicks |

If you need something to cross one of these lines that isn't listed here, that's a contract change. Post it in the channel first — someone else is building against the current shape.

---

## Part 5 — How to work today

**Build against fake data from the first minute.** Write a JSON file shaped like the contract and develop against that. Nobody should be sitting idle waiting for someone else's module. The graph view can render a hardcoded file. The detail panel can render a hardcoded team. The extraction function can run against a hardcoded reply string. When the real API appears, you swap one line.

**Check whether it already exists before you build it.** Grep the repo first. Six people working in parallel is exactly the situation that produces two incompatible implementations of the same helper. If it exists and has an owner, import it and tell them what you needed.

**Integrate at the halfway mark, not at the end.** At hour six we stop feature work and prove one thing end to end: a DM goes out, a human replies, the graph changes on screen. If that works, we have something submittable and everything after is polish. If it doesn't, we found out with six hours left instead of one.

**Know what "done" means.** One complete loop, demonstrated live, with a contradiction surfacing at the end of it. That's the bar. Everything beyond it is decoration, and decoration is what gets cut when time runs out — so don't start it until the loop works.

---

## Where things are written down

- **`README.md`** — what we're building and why, and the pitch framing
- **`PLAN.md`** — scope, architecture decisions, timeline, risks, and the responsibility answers we need ready for judges
- **`CONTRACT.md`** — the exact types, routes, and function signatures. Read before coding, don't change alone.
- **`GUIDE.md`** — this file
- **Issues** — one per module, with the actual checklist of work
