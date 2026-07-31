import { errorResponse, readJson } from '@/lib/api-response';
import { applyDeltaWithSignals } from '@/lib/graph-service';
import { generateGraphFromText } from '@/lib/mistral-bridge';
import { parseDelta, parseIngestRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const { text } = parseIngestRequest(await readJson(request));
    const generated = await generateGraphFromText(text);
    if (
      generated.upsertNodes === undefined
      && generated.upsertEdges === undefined
      && generated.deleteNodeIds === undefined
      && generated.deleteEdgeIds === undefined
    ) {
      return Response.json(generated);
    }
    const delta = parseDelta(generated);
    await applyDeltaWithSignals(delta);
    return Response.json(delta);
  } catch (error) {
    return errorResponse(error);
  }
}
