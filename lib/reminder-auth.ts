import { timingSafeEqual } from 'node:crypto';

export function isReminderWorkerAuthorized(request: Request): boolean {
  const expected = process.env.REMINDER_WORKER_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== 'production';

  const supplied = request.headers.get('x-athena-worker-secret') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
