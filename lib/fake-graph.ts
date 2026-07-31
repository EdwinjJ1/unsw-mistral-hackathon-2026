import type { Graph, GraphEdge, GraphNode } from './fake-types';

// Fixture used whenever GET /api/graph is unavailable. Timestamps are relative
// to module load so the "recently changed" pulse + particle effects are visible
// the instant the page opens, without waiting for a poll cycle.
const T0 = Date.now();
const ago = (ms: number) => new Date(T0 - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const seed = (ref: string) => ({ kind: 'seed' as const, ref });

const nodes: GraphNode[] = [
  // ---- Teams -------------------------------------------------------------
  {
    id: 'team.product',
    type: 'Team',
    label: 'Product',
    updatedAt: ago(2 * DAY),
    sourceRef: seed('fixture/teams'),
  },
  {
    id: 'team.engineering',
    type: 'Team',
    label: 'Engineering',
    updatedAt: ago(2 * DAY),
    sourceRef: seed('fixture/teams'),
  },
  {
    id: 'team.design',
    type: 'Team',
    label: 'Design',
    updatedAt: ago(2 * DAY),
    sourceRef: seed('fixture/teams'),
  },
  {
    id: 'team.legal-ops',
    type: 'Team',
    label: 'Legal / Ops',
    updatedAt: ago(2 * DAY),
    sourceRef: seed('fixture/teams'),
  },

  // ---- People ------------------------------------------------------------
  {
    id: 'person.priya-raman',
    type: 'Person',
    label: 'Priya Raman',
    teamId: 'team.product',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000001',
  },
  {
    id: 'person.tom-oduya',
    type: 'Person',
    label: 'Tom Oduya',
    teamId: 'team.product',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000002',
  },
  {
    id: 'person.maya-chen',
    type: 'Person',
    label: 'Maya Chen',
    teamId: 'team.engineering',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000003',
  },
  {
    id: 'person.dev-arora',
    type: 'Person',
    label: 'Dev Arora',
    teamId: 'team.engineering',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000004',
  },
  {
    id: 'person.sofia-lindqvist',
    type: 'Person',
    label: 'Sofia Lindqvist',
    teamId: 'team.engineering',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000005',
  },
  {
    id: 'person.jonas-weber',
    type: 'Person',
    label: 'Jonas Weber',
    teamId: 'team.design',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000006',
  },
  {
    id: 'person.amara-osei',
    type: 'Person',
    label: 'Amara Osei',
    teamId: 'team.design',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000007',
  },
  {
    id: 'person.helen-vasquez',
    type: 'Person',
    label: 'Helen Vasquez',
    teamId: 'team.legal-ops',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000008',
  },
  {
    id: 'person.raj-patel',
    type: 'Person',
    label: 'Raj Patel',
    teamId: 'team.legal-ops',
    updatedAt: ago(2 * DAY),
    discordUserId: '100000000000000009',
  },

  // ---- Tasks -------------------------------------------------------------
  {
    id: 'task.launch-brief',
    type: 'Task',
    label: 'Launch brief',
    teamId: 'team.product',
    ownerId: 'person.priya-raman',
    status: 'done',
    summary: 'One-pager covering positioning, launch date and success metrics.',
    dueDate: '2026-07-24',
    updatedAt: ago(3 * DAY),
  },
  {
    id: 'task.pricing-page-copy',
    type: 'Task',
    label: 'Pricing page copy',
    teamId: 'team.product',
    ownerId: 'person.tom-oduya',
    status: 'in_progress',
    summary: 'Final copy for the three pricing tiers, pending brand refresh.',
    dueDate: '2026-08-05',
    updatedAt: ago(5 * HOUR),
  },
  {
    id: 'task.auth-migration',
    type: 'Task',
    label: 'Auth migration',
    teamId: 'team.engineering',
    ownerId: 'person.maya-chen',
    status: 'done',
    summary: 'Move all services onto the new token service.',
    dueDate: '2026-07-28',
    updatedAt: ago(20 * HOUR),
  },
  {
    id: 'task.rollback-runbook',
    type: 'Task',
    label: 'Rollback runbook',
    teamId: 'team.engineering',
    ownerId: 'person.dev-arora',
    status: 'in_progress',
    summary: 'Step-by-step revert procedure for launch night.',
    dueDate: '2026-08-02',
    // Deliberately "just changed" so the pulse + heavy particles render on load.
    updatedAt: ago(6 * SEC),
    sourceRef: {
      kind: 'discord_dm',
      ref: 'discord/dm/dev-arora/2026-07-31',
      quote: 'Runbook draft is up, still need the DB step reviewed.',
    },
  },
  {
    id: 'task.load-test-harness',
    type: 'Task',
    label: 'Load test harness',
    teamId: 'team.engineering',
    ownerId: 'person.sofia-lindqvist',
    status: 'blocked',
    summary: 'Cannot run against staging until the data protection review clears.',
    dueDate: '2026-08-04',
    updatedAt: ago(9 * HOUR),
  },
  {
    id: 'task.onboarding-flow',
    type: 'Task',
    label: 'Onboarding flow',
    teamId: 'team.design',
    ownerId: 'person.jonas-weber',
    status: 'at_risk',
    summary: 'Three screens still in review with two days of runway left.',
    dueDate: '2026-08-03',
    updatedAt: ago(2 * HOUR),
  },
  {
    id: 'task.brand-refresh',
    type: 'Task',
    label: 'Brand refresh',
    teamId: 'team.design',
    ownerId: 'person.amara-osei',
    status: 'not_started',
    summary: 'New palette and type scale for the marketing surface.',
    dueDate: '2026-08-12',
    updatedAt: ago(4 * DAY),
  },
  {
    id: 'task.dpa-review',
    type: 'Task',
    label: 'DPA review',
    teamId: 'team.legal-ops',
    ownerId: 'person.helen-vasquez',
    status: 'blocked',
    summary: 'External counsel has not returned the data processing addendum.',
    dueDate: '2026-08-01',
    updatedAt: ago(7 * HOUR),
  },
  {
    id: 'task.launch-checklist',
    type: 'Task',
    label: 'Launch checklist',
    teamId: 'team.legal-ops',
    ownerId: 'person.raj-patel',
    status: 'blocked',
    summary: 'Held on auth sign-off before the go/no-go call.',
    dueDate: '2026-08-06',
    updatedAt: ago(3 * HOUR),
  },

  // ---- Decisions ---------------------------------------------------------
  {
    id: 'decision.staged-rollout',
    type: 'Decision',
    label: 'Staged rollout at 5%',
    teamId: 'team.engineering',
    summary: 'Ship to 5% of traffic for 24h before widening.',
    updatedAt: ago(1 * DAY),
  },
  {
    id: 'decision.freeze-pricing-tiers',
    type: 'Decision',
    label: 'Freeze pricing tiers',
    teamId: 'team.product',
    summary: 'No tier changes after 1 Aug so copy and legal can close out.',
    updatedAt: ago(1 * DAY),
  },

  // ---- Blockers ----------------------------------------------------------
  {
    id: 'blocker.legal-signoff',
    type: 'Blocker',
    label: 'Legal sign-off outstanding',
    teamId: 'team.legal-ops',
    summary: 'External counsel unresponsive for six days.',
    updatedAt: ago(6 * HOUR),
  },
];

const edges: GraphEdge[] = [
  // ---- MEMBER_OF ---------------------------------------------------------
  { id: 'edge.member.priya-raman', from: 'person.priya-raman', to: 'team.product', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.tom-oduya', from: 'person.tom-oduya', to: 'team.product', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.maya-chen', from: 'person.maya-chen', to: 'team.engineering', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.dev-arora', from: 'person.dev-arora', to: 'team.engineering', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.sofia-lindqvist', from: 'person.sofia-lindqvist', to: 'team.engineering', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.jonas-weber', from: 'person.jonas-weber', to: 'team.design', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.amara-osei', from: 'person.amara-osei', to: 'team.design', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.helen-vasquez', from: 'person.helen-vasquez', to: 'team.legal-ops', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },
  { id: 'edge.member.raj-patel', from: 'person.raj-patel', to: 'team.legal-ops', type: 'MEMBER_OF', updatedAt: ago(2 * DAY) },

  // ---- OWNS --------------------------------------------------------------
  { id: 'edge.owns.launch-brief', from: 'person.priya-raman', to: 'task.launch-brief', type: 'OWNS', updatedAt: ago(3 * DAY) },
  { id: 'edge.owns.pricing-page-copy', from: 'person.tom-oduya', to: 'task.pricing-page-copy', type: 'OWNS', updatedAt: ago(5 * HOUR) },
  { id: 'edge.owns.auth-migration', from: 'person.maya-chen', to: 'task.auth-migration', type: 'OWNS', updatedAt: ago(20 * HOUR) },
  { id: 'edge.owns.rollback-runbook', from: 'person.dev-arora', to: 'task.rollback-runbook', type: 'OWNS', updatedAt: ago(6 * SEC) },
  { id: 'edge.owns.load-test-harness', from: 'person.sofia-lindqvist', to: 'task.load-test-harness', type: 'OWNS', updatedAt: ago(9 * HOUR) },
  { id: 'edge.owns.onboarding-flow', from: 'person.jonas-weber', to: 'task.onboarding-flow', type: 'OWNS', updatedAt: ago(2 * HOUR) },
  { id: 'edge.owns.brand-refresh', from: 'person.amara-osei', to: 'task.brand-refresh', type: 'OWNS', updatedAt: ago(4 * DAY) },
  { id: 'edge.owns.dpa-review', from: 'person.helen-vasquez', to: 'task.dpa-review', type: 'OWNS', updatedAt: ago(7 * HOUR) },
  { id: 'edge.owns.launch-checklist', from: 'person.raj-patel', to: 'task.launch-checklist', type: 'OWNS', updatedAt: ago(3 * HOUR) },
  { id: 'edge.owns.staged-rollout', from: 'person.maya-chen', to: 'decision.staged-rollout', type: 'OWNS', updatedAt: ago(1 * DAY) },
  { id: 'edge.owns.freeze-pricing-tiers', from: 'person.priya-raman', to: 'decision.freeze-pricing-tiers', type: 'OWNS', updatedAt: ago(1 * DAY) },

  // ---- Cross-team DEPENDS_ON --------------------------------------------
  {
    id: 'edge.depends.pricing-on-brand',
    from: 'task.pricing-page-copy',
    to: 'task.brand-refresh',
    type: 'DEPENDS_ON',
    note: 'Copy cannot be finalised until the new type scale lands.',
    updatedAt: ago(6 * HOUR),
  },
  {
    id: 'edge.depends.onboarding-on-auth',
    from: 'task.onboarding-flow',
    to: 'task.auth-migration',
    type: 'DEPENDS_ON',
    note: 'The new onboarding screens sit behind the migrated auth flow.',
    updatedAt: ago(3 * HOUR),
  },

  // ---- BLOCKS ------------------------------------------------------------
  {
    id: 'edge.blocks.legal-signoff',
    from: 'blocker.legal-signoff',
    to: 'task.dpa-review',
    type: 'BLOCKS',
    note: 'No response from external counsel since 25 July.',
    updatedAt: ago(6 * HOUR),
  },

  // ---- The hidden signal: exactly one CONFLICTS_WITH ----------------------
  {
    id: 'edge.conflict.auth-status',
    from: 'task.auth-migration',
    to: 'task.launch-checklist',
    type: 'CONFLICTS_WITH',
    note: 'Engineering says auth shipped; Ops says still blocked on auth.',
    updatedAt: ago(40 * MIN),
  },
];

export const fakeGraph: Graph = { nodes, edges };

export default fakeGraph;
