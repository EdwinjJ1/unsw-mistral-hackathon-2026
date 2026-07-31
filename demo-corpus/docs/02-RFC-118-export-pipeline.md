# RFC-118 — Relay Export Pipeline Architecture
**Author:** Sam Okafor (Engineering) · **Status:** Accepted · **Last edited:** 2 days ago

## Summary

Design for the v2 export pipeline shipping with Relay 2.0. Covers job
orchestration, storage, and the delivery path. Supersedes the RFC-097 spike.

## Context

Workspace exports are heavy: median workspace is ~2GB with attachments, p95 is
11GB. Generating these synchronously inside a request cycle is not viable — the
March load test took the API cluster to 91% CPU with just 12 concurrent export
requests.

## Design

### Job model

Exports run as **asynchronous background jobs** on the worker pool:

1. Admin requests export → job enqueued, user gets immediate acknowledgment
2. Worker streams workspace data into a temp bundle
3. Bundle uploaded to object storage, signed URL generated
4. Notification (email + in-app) with download link

Target SLA: **p95 export ready within 5 minutes** of request. The
acknowledgment step is instant; the export itself is not, and we should not
pretend otherwise in the UI — show queued/processing states honestly.

### Storage & retention

Export bundles live in the `relay-exports` bucket with a 7-day signed-URL
expiry. Bundles are deleted after 7 days; re-download after that requires
generating a fresh export.

### Deleted-item handling

Export includes items in trash state, flagged with `"deleted": true` and a
`purge_after` timestamp so the bundle is self-describing about what's
recoverable.

### Dependencies

**This pipeline depends on the auth migration (AUTH-42) landing first.** The
worker pool authenticates to the storage layer via the new service-token
scheme; the legacy session-based path the old workers used is being removed as
part of AUTH-42. Until the migration is complete on all worker nodes, export
jobs cannot write to the bucket. Ops owns the rollout runbook for this.

### Failure modes

- Worker crash mid-export → job retried from checkpoint, max 3 attempts
- Bundle > 50GB → job fails with actionable error (split by project, planned
  post-launch)
- Storage unreachable → job parked, retried with backoff, admin notified after
  30 min

## Rollback

If the pipeline misbehaves post-launch, kill switch `relay2_export` reverts to
the manual support flow. The rollback runbook (Ops) must be finalized before
launch — flagging that it currently references the retention window as an
open question pending Legal.

## Alternatives considered

- **Synchronous generation with streaming download** — rejected, see load test.
- **Third-party export service** — rejected on data-handling grounds; Legal
  was firm that customer data can't transit an external processor for this.

## Sign-offs

- [x] Engineering (Sam)
- [x] Product (Priya)
- [ ] Ops runbook finalized (Marcus / on-call rotation)
