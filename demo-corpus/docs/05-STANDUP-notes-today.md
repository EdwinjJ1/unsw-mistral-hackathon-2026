# Standup Notes — Relay 2.0 launch group
**Date:** today, 10:00 · **Scribe:** Dana Liu · attendees: Priya, Sam, Dana, Aisha, Marcus (async)

## Engineering (Sam)

- Export pipeline: checkpoint-retry landed, load test rerun green at 2x
  projected launch traffic.
- **AUTH-42: migration shipped.** Worker pool is on the new service-token
  scheme as of last night's deploy. Closing the ticket today. Nothing blocking
  from platform side.
- Next: EU bucket provisioning, ETA tomorrow.

## Product (Priya)

- Launch checklist ~80% green. Two open items: legal sign-off (Marcus says in
  review, expecting today), and the comms plan which still has no owner —
  I'll take it if nobody volunteers by EOD, but flagging capacity.
- Pricing page copy approved by marketing. "Your data, out in minutes" —
  much better than the old draft that promised instant, which Sam pushed back
  on. Good catch.

## Design (Dana)

- Trash/restore UI in staging, looks solid. Empty-state copy references the
  30-day window per the PRD — shout if that number is moving, it's baked into
  three screens and the help article draft.
- Export progress states done: queued → processing → ready. No fake spinners.

## Ops (Aisha)

- Rollback runbook still DRAFT. Was blocked on two things as of yesterday;
  hearing conflicting info on whether AUTH-42 is actually done — Sam says
  shipped, but 4/10 nodes was the count in the platform dashboard yesterday
  evening. Will reconcile after standup and update the runbook either way.
- On-call schedule for launch week posted.

## Legal (Marcus, async note)

- Data-handling memo circulated yesterday. Sign-off remains conditional —
  see memo §4. Please actually read §2.

## Actions

- [ ] Aisha ↔ Sam: reconcile AUTH-42 status (dashboard vs deploy log)
- [ ] Priya: find comms plan owner by EOD
- [ ] Sam: EU bucket ETA to Marcus
- [ ] All: read Marcus's memo §2 (retention window)
