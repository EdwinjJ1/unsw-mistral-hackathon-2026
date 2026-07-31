# MEMO — Data Handling Review: Relay 2.0 Export & Deletion
**From:** Marcus Webb (Legal/Ops) · **To:** Relay 2.0 launch group
**Date:** yesterday · **Classification:** Internal

## Purpose

Summary of the legal review of data-handling changes shipping in Relay 2.0,
covering the export feature and deletion/recovery behaviour. This memo records
the constraints the launch must satisfy. Product and Engineering should treat
these as launch-blocking requirements, not suggestions.

## 1. Export bundles

No issues with the 7-day signed-URL scheme as designed in RFC-118. Two
requirements:

1. Signed URLs must be single-workspace scoped (confirmed already the case).
2. The export must exclude any content the requesting workspace does not own
   — specifically cross-workspace linked items. Engineering has confirmed
   linked items are reference-only in the bundle. Acceptable.

## 2. Deleted-item retention — REQUIREMENT

Under the processor addendum we signed with Meridian (our largest Enterprise
customer, and the template now applied to all Enterprise contracts as of
May), deleted customer payloads may be retained in recoverable form for a
**maximum of 14 days** after deletion. After 14 days, deleted payloads must be
purged from primary storage and excluded from new export bundles. Backup
expiry follows the standard 30-day backup cycle, which the addendum permits,
but *user-facing recoverability beyond 14 days is a contractual breach* for
any Enterprise workspace on the new template.

I understand the product side has been exploring a longer recovery window for
usability reasons. To be explicit: **14 days is the ceiling for Enterprise
workspaces.** If Product wants a longer window for Free/Growth tiers, that is
legally fine, but it requires tier-differentiated purge logic, which — per my
conversation with the platform team in April — does not currently exist and
was descoped from Relay 2.0.

## 3. EU workspaces

Export bundles for EU-resident workspaces must be generated and stored in the
EU region. Engineering to confirm the `relay-exports` bucket has an EU
counterpart before launch. Open item.

## 4. Sign-off status

Legal sign-off on the launch is **conditional** on:
- [ ] Deletion recoverability capped at 14 days for Enterprise workspaces
      (or tier-differentiated purge shipped)
- [ ] EU export region confirmed
- [x] Export scoping (confirmed)

I have not yet received confirmation on the first two items. Until then,
treat Legal sign-off as pending, regardless of what the launch checklist
currently shows.

— Marcus
