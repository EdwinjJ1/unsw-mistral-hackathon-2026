import { claimDueReminders } from '@/lib/reminders';
import { isReminderWorkerAuthorized } from '@/lib/reminder-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!isReminderWorkerAuthorized(request)) {
    return Response.json({ error: 'Unauthorized reminder worker' }, { status: 401 });
  }
  return Response.json({ reminders: claimDueReminders() });
}
