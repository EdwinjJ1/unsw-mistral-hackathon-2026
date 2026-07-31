# Rollback Runbook — Teamspace Digest (DRAFT)
**Owner:** Sam Okafor (Ops) · **Reviewer:** Aiden · **Status:** DRAFT — do not rely on this
**Last edited:** today 09:40

> ⚠️ Two blockers before this leaves draft. See §4.

---

## 1. When to use this

Digest error rate above 5% over 15 minutes, generation queue backing up beyond
30 minutes, or any data-handling incident involving digest content.

## 2. Kill switch

```
flagctl set teamspace_digest off --env prod --reason "<incident id>"
```

Disables digest generation. In-flight jobs complete; queued jobs park.

## 3. Cleanup

1. Confirm queue drain: `digest-workers queue stats`
2. Parked jobs older than 24h: notify space admins via the incident macro
3. If data-handling related, page Aiden before purging anything

## 4. Blockers on finalising this runbook

### 4.1 Migration scope is ambiguous

Engineering reported the token-scheme migration complete yesterday — "all 200
instances are on the new scheme."

I need to flag that **we may not mean the same thing by "instance."**

The capacity table in §5 is built on *customer instances* — the tenant spaces
that digest jobs actually run against. There are roughly 4,000 of those.
Engineering's migration ticket references 200, which matches our count of
*service instances* — the compute nodes in the worker fleet.

If the migration covered 200 service instances, that's complete and we're
fine. If someone read "200 instances" as customer coverage, we have 3,800
tenant spaces that will fail authentication the moment digest generation runs
at launch volume.

I am not saying anyone is wrong. I am saying the word is doing two jobs and
nobody has checked which one. **Blocked pending confirmation of migration
scope from Henry.**

### 4.2 Purge behaviour is undefined

Cleanup in §3 can't be finalised while the recovery window is unsettled
between Product and Legal. The purge steps are materially different at 14 days
versus 30. I've written §3 assuming *a* window exists, but the actual number
changes what we do with parked deletion jobs.

**Blocked pending the Luna/Aiden decision.**

## 5. Capacity reference — assumes full customer-instance coverage, see §4.1

| Scenario | Worker fleet | Concurrent digests | p95 generation |
|---|---|---|---|
| Normal | full | 400 | 3m 20s |
| Degraded | 60% | 240 | 6m 10s |
| Minimum viable | 40% | 160 | 11m+ |

## 6. Contacts

- Digest pipeline: Henry (Engineering)
- Migration scope: Priya Sharma (Platform)
- AI platform / rate limits: Asjad, Nick
- Data handling: Aiden
- Launch commander: Luna
