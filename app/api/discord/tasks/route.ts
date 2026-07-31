import { errorResponse, readJson } from '@/lib/api-response';
import { pushTaskToDiscord } from '@/lib/discord';
import { parseTaskAction } from '@/lib/task-actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const task = parseTaskAction(await readJson(request));
    const messageId = await pushTaskToDiscord(task);
    return Response.json({ ok: true, messageId });
  } catch (error) {
    if (
      error instanceof Error
      && ['DISCORD_NOT_CONFIGURED', 'DISCORD_CHANNEL_NOT_CONFIGURED'].includes(error.message)
    ) {
      return Response.json(
        { error: 'Discord push is not configured on the server' },
        { status: 503 },
      );
    }
    return errorResponse(error);
  }
}
