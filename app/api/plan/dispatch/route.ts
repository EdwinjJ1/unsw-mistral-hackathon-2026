import { NextResponse } from 'next/server';
import { getPlanDispatchReceipts, savePlanDispatchReceipt } from '@/lib/graph';
import type { PlanDispatchReceipt, PlanDispatchStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set<PlanDispatchStatus>(['sent', 'unmatched', 'failed']);

export function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get('planId')?.trim();
  if (!planId) return NextResponse.json({ error: 'planId is required' }, { status: 400 });
  return NextResponse.json({ planId, receipts: getPlanDispatchReceipts(planId) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<PlanDispatchReceipt>;
    if (!body.planId?.trim() || !body.ownerKey?.trim() || !body.owner?.trim()) {
      return NextResponse.json({ error: 'planId, ownerKey and owner are required' }, { status: 400 });
    }
    if (!body.status || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid dispatch status' }, { status: 400 });
    }
    const receipt: PlanDispatchReceipt = {
      planId: body.planId.trim(),
      ownerKey: body.ownerKey.trim(),
      ...(body.ownerId?.trim() ? { ownerId: body.ownerId.trim() } : {}),
      owner: body.owner.trim(),
      ...(body.discordUserId?.trim() ? { discordUserId: body.discordUserId.trim() } : {}),
      status: body.status,
      ...(body.messageId?.trim() ? { messageId: body.messageId.trim() } : {}),
      ...(body.detail?.trim() ? { detail: body.detail.trim().slice(0, 500) } : {}),
      updatedAt: new Date().toISOString(),
    };
    savePlanDispatchReceipt(receipt);
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not record dispatch' },
      { status: 500 },
    );
  }
}
