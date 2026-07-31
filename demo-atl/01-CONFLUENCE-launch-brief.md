# Teamspace Digest — Launch Brief
**Space:** Product / Teamspace Digest · **Page owner:** Luna · **Status:** APPROVED
**Contributors:** Henry (Engineering), Shirley (Design), Aiden (Legal & Ops), Asjad (AI Platform)
**Last edited:** 2 days ago

---

## Why we're building this

Teams generate more written work in a week than any individual can read. Our
research sessions surfaced the same complaint in 11 of 14 interviews: people
don't want more content, they want to know what changed and whether it affects
them.

Teamspace Digest generates a weekly summary per team space, highlighting
decisions made, work completed, and open items — with links back to the source
pages so nothing is taken on trust.

## Scope for launch

**In scope**
- Weekly digest per team space, delivered in-product and via email
- Every claim in the digest links back to its source page or ticket
- Recoverable trash for deleted spaces and pages, with self-serve restore

**Out of scope (fast-follow)**
- Custom digest cadence
- Cross-space digests
- Digest export

## Key decisions

### Recovery window — 30 days

After the accidental-deletion escalations in March, we're committing to a
**30-day recovery window** for deleted pages and spaces. Deleted items move to
a recoverable trash state and stay restorable by space admins for 30 days.

This was validated in **6 of 6 customer interviews**. Shorter windows tested
poorly — the most common objection was that two weeks disappears fast if
someone is on leave when a deletion happens.

Shirley's team has already built the trash experience around this number. The
empty state reads "Items stay in Trash for 30 days," and the same figure
appears in the help-centre article draft.

### Digest generation

Digests generate on a schedule, not on demand. Engineering's design (see
Henry's RFC) runs this as a background job. Copy should reflect that honestly —
no fake progress spinners.

## Launch checklist

- [x] Digest pipeline design accepted (Henry)
- [x] Trash and restore experience in staging (Shirley)
- [ ] Model selection and launch-day rate limits confirmed (Asjad, Nick)
- [ ] Legal sign-off on data handling (Aiden) — in review
- [ ] EU data region confirmed (Henry)
- [ ] Rollback runbook finalised (Sam)
- [ ] **Launch-day comms plan — still unowned.** Flagging again; this is the
      third week. If nobody picks it up I'll take it, but I'm also launch
      commander and that's not a good combination.

## Open questions

- Do we need a separate digest opt-out at the space level, or is account-level
  enough? (Shirley checking with research)
- What happens to a digest that references a page deleted after generation?
