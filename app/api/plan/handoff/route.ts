import { NextResponse } from 'next/server';
import { buildHandoffManifest } from '@/lib/handoff';
import { getGraph, getLatestPlan, getPlanDispatchReceipts } from '@/lib/graph';
import { currentPlanFromGraph, ensurePlanClarifications } from '@/lib/planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const graph = getGraph();
  const plan = ensurePlanClarifications(getLatestPlan() ?? currentPlanFromGraph(graph));
  const manifest = buildHandoffManifest(plan, graph, getPlanDispatchReceipts(plan.id));
  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
