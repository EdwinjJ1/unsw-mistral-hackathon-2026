import { errorResponse } from '@/lib/api-response';
import { getGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  try {
    return Response.json(getGraph());
  } catch (error) {
    return errorResponse(error);
  }
}
