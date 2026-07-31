import { NextResponse } from 'next/server';
import { applyDeltaWithSignals } from '@/lib/graph-service';
import { getGraph } from '@/lib/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { personId?: string; discordUserId?: string };
    const personId = body.personId?.trim();
    const discordUserId = body.discordUserId?.trim();
    if (!personId || !discordUserId) {
      return NextResponse.json(
        { error: 'personId and discordUserId are required' },
        { status: 400 },
      );
    }
    if (!/^\d{15,22}$/.test(discordUserId)) {
      return NextResponse.json({ error: 'discordUserId must be a Discord snowflake' }, { status: 400 });
    }
    const graph = getGraph();
    const person = graph.nodes.find((node) => node.id === personId && node.type === 'Person');
    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    const alreadyLinked = graph.nodes.find(
      (node) => node.type === 'Person' && node.id !== personId && node.discordUserId === discordUserId,
    );
    if (alreadyLinked) {
      return NextResponse.json(
        { error: `Discord user is already linked to ${alreadyLinked.label}` },
        { status: 409 },
      );
    }

    await applyDeltaWithSignals({
      upsertNodes: [{ ...person, discordUserId, updatedAt: new Date().toISOString() }],
    });
    return NextResponse.json({ ok: true, personId, discordUserId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not link Discord user' },
      { status: 500 },
    );
  }
}
