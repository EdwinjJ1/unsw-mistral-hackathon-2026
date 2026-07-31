# PRD — Relay Data Export v2
**Owner:** Priya Sharma (Product) · **Status:** Approved for build · **Last edited:** 3 days ago
**Reviewers:** Sam Okafor (Eng), Dana Liu (Design), Marcus Webb (Legal/Ops)

---

## 1. Background

Relay customers on Growth and Enterprise tiers have been asking for self-serve
data export since Q1. Support currently handles ~40 manual export requests per
week, each taking 15-25 minutes of an engineer's time. Three churned accounts in
the last quarter cited "can't get my data out" in exit interviews.

This PRD covers the v2 export experience shipping with the Relay 2.0 launch.

## 2. Goals

- Customers can export their full workspace (projects, tasks, comments,
  attachments) without contacting support.
- Reduce manual export tickets by 80% within one quarter of launch.
- Exports must feel **instant** from the customer's perspective — this came up
  in every usability session. Waiting on a spinner is the #1 complaint with
  competitor export flows.

## 3. Non-goals

- Partial/filtered exports (post-launch fast-follow).
- Import from competitor formats (separate initiative, see IMPORT-PRD).
- API-based programmatic export (Enterprise roadmap, Q4).

## 4. User stories

1. As a workspace admin, I can request a full export from Settings → Data and
   receive a download link without leaving the page.
2. As a workspace admin, I can see a history of past exports and re-download
   any of them.
3. As a customer who deleted something by mistake, I can restore it myself.

## 5. Key decisions

### 5.1 Undo window
After the deletion-recovery incidents in March, we're committing to a
**30-day undo window** for deleted projects and tasks. Deleted items move to a
recoverable trash state and remain restorable by workspace admins for 30 days
before permanent purge. Dana's team has already designed the trash UI around
this — the empty state literally says "Items stay here for 30 days."

This was validated in 6 of 6 customer interviews. Shorter windows tested poorly
("two weeks disappears fast when you're on leave").

### 5.2 Export freshness
Exports reflect workspace state at the moment of request. No incremental/delta
exports at launch.

### 5.3 Attachment handling
Attachments over 100MB are linked, not bundled, to keep archive sizes sane.

## 6. Success metrics

- Export completion rate > 95%
- Support export tickets down 80% by end of quarter
- Restore-from-trash used at least once by 20% of active workspaces in 90 days

## 7. Launch requirements

- [ ] Export flow live behind `relay2_export` flag
- [ ] Trash/restore UI shipped (Design — done, in staging)
- [ ] Legal sign-off on data handling (Marcus — in review)
- [ ] Support macro + help-center article (owner TBD)
- [ ] Launch-day comms plan (owner TBD — flagging again, this has no owner
      since Jordan left)

## 8. Open questions

- Do EU workspaces need a separate export region? (Marcus checking)
- Rate limit per workspace? Sam suggests 3/day, revisit after launch data.
