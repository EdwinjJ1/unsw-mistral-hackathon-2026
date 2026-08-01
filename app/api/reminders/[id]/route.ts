import { errorResponse, readJson } from '@/lib/api-response';
import { isReminderWorkerAuthorized } from '@/lib/reminder-auth';
import { finishReminder } from '@/lib/reminders';
import { ValidationError } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseOutcome(value: unknown):
  | { sent: true; messageId: string }
  | { sent: false; error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('request body must be an object');
  }
  const input = value as Record<string, unknown>;
  if (input.sent === true && typeof input.messageId === 'string' && input.messageId.trim()) {
    return { sent: true, messageId: input.messageId.trim() };
  }
  if (input.sent === false && typeof input.error === 'string' && input.error.trim()) {
    return { sent: false, error: input.error.trim() };
  }
  throw new ValidationError('request body must contain a valid reminder outcome');
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  if (!isReminderWorkerAuthorized(request)) {
    return Response.json({ error: 'Unauthorized reminder worker' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = finishReminder(id, parseOutcome(await readJson(request)));
    if (!reminder) return Response.json({ error: 'Reminder not found' }, { status: 404 });
    return Response.json({ ok: true, reminder });
  } catch (error) {
    return errorResponse(error);
  }
}
