import { errorResponse, readJson } from '@/lib/api-response';
import { ingestDocumentSet } from '@/lib/ingest';
import { parseIngestRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request) as { text?: unknown; sourceName?: unknown };
    const { text } = parseIngestRequest(body);
    const sourceName = typeof body.sourceName === 'string' && body.sourceName.trim()
      ? body.sourceName.trim().slice(0, 160)
      : 'pasted-document.md';
    const result = await ingestDocumentSet({
      documents: [{ name: sourceName, text }],
      sourceName,
      replace: false,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
