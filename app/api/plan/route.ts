import { NextResponse } from 'next/server';
import { getGraph, getLatestPlan } from '@/lib/graph';
import { currentPlanFromGraph, ensurePlanClarifications } from '@/lib/planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const plan = ensurePlanClarifications(getLatestPlan() ?? currentPlanFromGraph(getGraph()));
  return NextResponse.json(plan, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
