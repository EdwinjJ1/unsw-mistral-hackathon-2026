import { errorResponse, readJson } from '@/lib/api-response';
import { applyDeltaWithSignals } from '@/lib/graph-service';
import { parseDelta } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const delta = parseDelta(await readJson(request));
    const { changed } = await applyDeltaWithSignals(delta);
    return Response.json({ ok: true, changed });
  } catch (error) {
    return errorResponse(error);
  }
}
