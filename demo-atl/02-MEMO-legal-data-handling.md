# Data Handling Review — Teamspace Digest Launch
**From:** Aiden (Legal & Ops) · **To:** Digest launch group
**Date:** yesterday · **Classification:** Internal

---

## Purpose

Review of the data-handling changes shipping with Teamspace Digest, covering
digest generation, storage, and deletion recovery. The constraints below are
launch-blocking requirements, not preferences.

## 1. Digest generation and storage

No objection to the pipeline design in Henry's RFC. Two requirements:

1. Digests must be scoped to a single space and must not surface content the
   requesting user cannot already access. Engineering has confirmed permission
   filtering happens before summarisation, not after. Acceptable.
2. **EU-resident spaces must have digests generated and stored in region.**
   Henry to confirm the EU deployment exists before launch. Currently
   unconfirmed and I've asked twice.

## 2. Deletion recovery — REQUIREMENT

Under the Enterprise processor addendum — which since May is the template
applied to all new Enterprise contracts — deleted customer content may be
retained in user-recoverable form for a **maximum of 14 days** after deletion.
After 14 days it must be purged from primary storage.

Backup expiry follows the standard 30-day cycle, which the addendum permits.
But **user-facing recoverability beyond 14 days is a contractual breach** for
any Enterprise space on the current template.

I understand Product has validated a longer recovery window with customers and
I don't dispute that research. To be explicit about the constraint: **14 days
is the ceiling for Enterprise spaces.** A longer window for other tiers is
legally fine, but requires tier-differentiated purge logic, which per the
platform team in April does not currently exist and was descoped from this
launch.

This needs a decision from Luna and me together before the freeze. It is not
an Engineering problem and it will not resolve itself.

## 3. Sign-off status

Legal sign-off is **conditional** on:
- [ ] Recovery window capped at 14 days for Enterprise spaces, or
      tier-differentiated purge shipped
- [ ] EU data region confirmed
- [x] Permission scoping on digest content (confirmed)

Until the first two are closed, treat Legal sign-off as pending regardless of
what the launch checklist shows. I've seen it marked "in review, expected
today" for four days.

— Aiden
