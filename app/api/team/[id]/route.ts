import { errorResponse } from '@/lib/api-response';
import { getTeamDetail } from '@/lib/graph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    const detail = getTeamDetail(id);
    if (!detail) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }
    return Response.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
