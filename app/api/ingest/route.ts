import { errorResponse, readJson } from '@/lib/api-response';
import { applyDeltaWithSignals } from '@/lib/graph-service';
import { generateGraphFromText } from '@/lib/mistral-bridge';
import { parseDelta, parseIngestRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const { text } = parseIngestRequest(await readJson(request));
    const delta = parseDelta(await generateGraphFromText(text));
    await applyDeltaWithSignals(delta);
    return Response.json(delta);
  } catch (error) {
    return errorResponse(error);
  }
}
