import { errorResponse } from '@/lib/api-response';
import { getPersonSubgraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ discordUserId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { discordUserId } = await context.params;
    return Response.json(getPersonSubgraph(discordUserId));
  } catch (error) {
    return errorResponse(error);
  }
}
