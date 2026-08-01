import { NextResponse } from 'next/server';
import { buildHandoffManifest } from '@/lib/handoff';
import {
  consumePlanFollowup,
  deletePlanDispatchReceipts,
  getGraph,
  getLatestPlan,
  getPendingPlanFollowups,
  getPlanDispatchReceipts,
  queuePlanFollowup,
} from '@/lib/graph';
import { currentPlanFromGraph, ensurePlanClarifications } from '@/lib/planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** Pending follow-up requests, polled by the Discord bot. */
export function GET() {
  return NextResponse.json({ requests: getPendingPlanFollowups() }, noStore);
}

/**
 * Queue a follow-up for one department (or the whole plan). Clearing the
 * dispatch receipts makes the affected handoffs pending again, so the bot's
 * next poll re-sends the DMs.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { teamId?: string };
    const teamId = body.teamId?.trim() || undefined;

    const graph = getGraph();
    const plan = ensurePlanClarifications(getLatestPlan() ?? currentPlanFromGraph(graph));
    const manifest = buildHandoffManifest(plan, graph, getPlanDispatchReceipts(plan.id));

    const handoffs = manifest.handoffs.filter((handoff) =>
      !teamId || handoff.assignments.some((assignment) => assignment.departmentId === teamId),
    );
    if (handoffs.length === 0) {
      return NextResponse.json(
        { error: 'No open assignments to follow up for this department.' },
        { status: 404 },
      );
    }

    const ownerKeys = handoffs.map((handoff) => handoff.ownerKey);
    deletePlanDispatchReceipts(plan.id, ownerKeys);
    const teamLabel = teamId
      ? graph.nodes.find((node) => node.id === teamId)?.label
      : undefined;
    const queued = queuePlanFollowup({
      planId: plan.id,
      ...(teamId ? { teamId } : {}),
      ...(teamLabel ? { teamLabel } : {}),
      ownerKeys,
    });

    return NextResponse.json({
      ok: true,
      request: queued,
      owners: handoffs.map((handoff) => ({
        owner: handoff.owner,
        ownerKey: handoff.ownerKey,
        hasDiscordIdentity: Boolean(handoff.discordUserId),
      })),
    }, noStore);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not queue follow-up' },
      { status: 500 },
    );
  }
}

/** Mark a follow-up request as handled. Called by the bot after dispatching. */
export function DELETE(request: Request) {
  const id = Number.parseInt(new URL(request.url).searchParams.get('id') ?? '', 10);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  consumePlanFollowup(id);
  return NextResponse.json({ ok: true }, noStore);
}
