import { errorResponse, readJson } from '@/lib/api-response';
import { createReminder, listQueuedReminders } from '@/lib/reminders';
import { parseReminderRequest } from '@/lib/task-actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicReminder(reminder: ReturnType<typeof createReminder>) {
  return {
    id: reminder.id,
    taskKey: reminder.taskKey,
    remindAt: reminder.remindAt,
    status: reminder.status,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const taskKey = new URL(request.url).searchParams.get('taskKey')?.trim() || undefined;
    return Response.json({
      reminders: listQueuedReminders(taskKey).map(publicReminder),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { task, remindAt } = parseReminderRequest(await readJson(request));
    const reminder = createReminder(task, remindAt);
    return Response.json({ ok: true, reminder: publicReminder(reminder) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'DISCORD_CHANNEL_NOT_CONFIGURED') {
      return Response.json(
        { error: 'Discord reminder channel is not configured on the server' },
        { status: 503 },
      );
    }
    return errorResponse(error);
  }
}
