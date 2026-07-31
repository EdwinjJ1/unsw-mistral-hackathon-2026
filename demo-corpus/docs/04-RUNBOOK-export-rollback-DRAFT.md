# RUNBOOK (DRAFT) — Relay 2.0 Export Rollback
**Owner:** on-call rotation (currently Aisha Torres, Ops) · **Status:** DRAFT — do not rely on this yet
**Last edited:** today, 09:40

> ⚠️ DRAFT status. Two blockers before this can be finalized — see §5.

## 1. When to use this

Use this runbook if the v2 export pipeline needs to be disabled post-launch:
error rate > 5% over 15 min, storage write failures, or a data-handling
incident.

## 2. Kill switch

```
flagctl set relay2_export off --env prod --reason "<incident id>"
```

This reverts export requests to the legacy manual-support flow. In-flight
jobs are allowed to complete; queued jobs are parked, not dropped.

## 3. Draining and cleanup

1. Confirm queue depth trending to zero: `relay-workers queue stats`
2. Parked jobs older than 24h: notify workspace admins via the incident macro
3. If the incident is data-handling related, page Legal (Marcus) before any
   bundle deletion — do not purge evidence.

## 4. Restore path

Re-enabling requires:
- Root cause documented in the incident doc
- Storage health green for 30 consecutive minutes
- Sign-off from the launch commander

## 5. Current blockers on finalizing this runbook

1. **AUTH-42 migration is still in progress on the worker pool.** As of this
   morning, 4 of 10 worker nodes are migrated. Export jobs route only to
   migrated nodes, which is fine at staging load but will not hold at launch
   traffic. The runbook's capacity numbers in §6 assume the full pool.
   Status: **blocked pending auth migration completion.** Sam's team owns
   AUTH-42; last update in #eng-platform said "targeting end of week."

2. **Purge behaviour on rollback is undefined until the retention window is
   settled.** §3 cleanup steps can't be finalized while the recoverable-trash
   window is still an open question between Product and Legal. I've written
   the steps assuming *some* window exists but the actual number changes what
   we do with parked deletion jobs. Waiting on that decision.

## 6. Capacity reference (assumes full worker pool — see §5.1)

| Scenario | Worker nodes | Max concurrent exports | p95 completion |
|---|---|---|---|
| Normal | 10 | 40 | 4m 10s |
| Degraded | 6 | 24 | 7m 30s |
| Minimum viable | 4 | 16 | 11m+ |

## 7. Contacts

- Export pipeline: Sam Okafor (Eng)
- Storage: platform on-call
- Legal/data-handling: Marcus Webb
- Launch commander: Priya Sharma
