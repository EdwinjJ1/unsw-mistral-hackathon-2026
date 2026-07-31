# DEMO CORPUS — README & PLANTED SIGNALS MAP
### One fictional launch. Five documents, one deck, one Slack export, two voice memos, six ingest payloads. Every planted signal cross-referenced.

**The fictional world:** a company shipping **Relay 2.0**, a data-export +
trash/restore feature. Four teams — Product (Priya Sharma), Engineering (Sam
Okafor), Design (Dana Liu), Legal/Ops (Marcus Webb, Aisha Torres). This
matches the team structure in your seed data and the exact scenario beats in
PLAN.md (rollback runbook, retention window, auth migration), so it composes
with what's already seeded instead of fighting it.

---

## THE PLANTED SIGNALS (your hidden edges)

### SIGNAL 1 — THE HERO: 14-day vs 30-day retention window
The contractual retention cap vs. the product's promised recovery window.
This is your PLAN.md §5 demo beat, expressed across five artifacts:

| Where | How it's stated |
|---|---|
| PRD §5.1 | "committing to a **30-day undo window**… validated in 6 of 6 interviews" |
| Legal memo §2 | "**maximum of 14 days**… recoverability beyond 14 days is a contractual breach" |
| Deck slide 2 | "**30-day recovery window** customers loved in research" (bolded) |
| Slack | Dana: copy reads "Items stay here for 30 days" / Marcus: "please read my memo" |
| Voice 2 / payload 4 | Priya: the 30-day number is now in the help article in 4 places — "it compounds every day we don't decide" |

**Why it's a strong hero:** neither side is wrong. Product validated 30 days
with users; Legal signed a contract capping it at 14. Classic
cross-discipline conflict — exactly your pitch thesis. And the voice memo
adds the escalation arc: the longer it goes uncaught, the more artifacts it
infects.

### SIGNAL 2 — THE LIVE-DEMO CONFLICT: "auth shipped" vs "blocked on auth"
Your seeded Engineering/Ops scenario, restated naturally:

| Where | How it's stated |
|---|---|
| Standup notes | Sam: "**AUTH-42: migration shipped**… closing the ticket today" |
| Runbook §5.1 | "4 of 10 worker nodes migrated… **blocked pending auth migration completion**" |
| Deck slide 4 | Risk table marks worker capacity "**Resolved** — AUTH-42 migration shipped" |
| Slack | The dashboard-vs-deploy-log argument, twice, escalating |
| Voice 1 | Aisha: "six out of ten nodes this morning… my capacity table assumes the full pool" |
| Payloads 1→3→5 | Sequenced so the conflict forms ON SCREEN during ingest |

**Demo choreography:** ingest payload 1 (Sam's claim enters), then payload 3
(runbook's "blocked" enters) → the CONFLICTS_WITH edge should fire live.
Payload 5 tests dedup: it restates Sam's side and should attach to the
existing conflict, not spawn a duplicate.

### SIGNAL 3 — THE UNOWNED TASK: launch-day comms plan
No owner, three weeks running, launch commander about to absorb it herself.
In: PRD §7, standup actions, Slack ("not it 😅"), deck slide 4 ("Open —
needs a name by freeze"), voice 2, tasks.csv (TASK-208, empty owner field).
**Use:** the graph should show an ownerless task node — a different *kind* of
hidden signal than a contradiction, proving the product catches more than one
failure mode.

### SIGNAL 4 — THE DEPENDENCY CHAIN: runbook → auth AND runbook → retention decision
The runbook is doubly blocked: on AUTH-42 (Engineering) and on the retention
decision (Product×Legal). One artifact, two cross-team DEPENDS_ON edges —
makes the graph visually interesting and demos the "Direct" bot behaviour
("talk to Sam about AUTH-42, talk to Marcus about retention").

### SIGNAL 5 — THE QUIET ONE (stretch, only if asked "what else did it find?")
Deck slide 4 lists "Legal sign-off — **On track**, expected before freeze"
while the memo says sign-off is *conditional* on two unmet items and Slack has
Marcus calling the checklist "optimistic." A checklist-vs-reality drift signal.
Subtler than 1-2; nice Q&A ammunition if a judge digs.

### NOISE CONTROLS (as important as the signals)
- Slack: dumpling-lunch thread, emoji reactions, "rip" — must extract to NOTHING
- Payload 6: pure noise, must produce an empty delta — **run this in testing;
  if it creates nodes, your extraction is over-firing and will spam in the live demo**
- Every doc is ~80% realistic operational content the model must read *past*

---

## FILE INVENTORY

| File | What it is | Feed via |
|---|---|---|
| docs/01-PRD-relay-export-v2.md | Product spec (30-day window, "instant" tension, unowned comms) | /api/ingest or doc upload |
| docs/02-RFC-118-export-pipeline.md | Eng architecture (async ≤5min, AUTH-42 dependency) | same |
| docs/03-MEMO-legal-data-handling.md | Legal constraints (14-day cap, conditional sign-off) | same |
| docs/04-RUNBOOK-export-rollback-DRAFT.md | Ops runbook (blocked ×2, capacity table) | same |
| docs/05-STANDUP-notes-today.md | Standup (Sam's "shipped" claim, Aisha's dispute) | same |
| docs/06-DECK-launch-readiness.pptx | PM's readiness deck (risk table marks auth "Resolved") | file upload if OCR path exists; else use the deck live as "the artifact the team believed" |
| slack/channel-relay2-launch.txt | 48h of channel history, signals + noise interleaved | ingest, or replay line-by-line through the bot |
| voice/voice-scripts-and-fixtures.md | 2 voice-memo scripts to record + 6 DM reply fixtures + tasks.csv | record on a phone; transcripts are payloads 4-5; replies feed the Absorb path |
| payloads/ingest-payloads.json | 6 sequenced ready-to-POST payloads with expected outcomes | curl straight into /api/ingest |

## SUGGESTED DEMO SEQUENCE (composes with PLAN.md §5's script)

1. Open on the graph with the base seed — calm, mostly monochrome.
2. Ingest payload 1 (standup): tasks light up, Sam's claim lands. Normal ops.
3. Ingest payload 2 (legal memo): **hero conflict fires** — 14 vs 30, both
   quotes, Product↔Legal. Let it breathe. This is the money moment.
4. Ingest payload 3 (runbook): **second conflict** — Eng↔Ops auth dispute,
   plus the double dependency chain appears.
5. Bot beat: show the check-in DM → feed REPLY 1 (Aisha) through Absorb →
   Blocker node appears; REPLY 2 (Sam) attaches to the existing conflict.
6. Payload 6 (noise): nothing happens. Say out loud that nothing happening
   is a feature — "it stays quiet unless it has evidence."
7. If asked what else it caught: signals 3 (ownerless task) and 5 (checklist
   drift) are your encore.

## TESTING CHECKLIST (before the demo, cache everything)

- [ ] Each payload 1-5 produces the expected nodes/edges (see `expect` fields)
- [ ] Payload 6 produces an EMPTY delta
- [ ] Payload 5 attaches to the existing conflict (no duplicate conflict node)
- [ ] The hero conflict renders with BOTH verbatim quotes + correct teams
- [ ] TASK-208 renders with no owner and is visually distinguishable
- [ ] Full sequence run warm so the live demo replays from cache
