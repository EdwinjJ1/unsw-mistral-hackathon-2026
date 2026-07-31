import { randomUUID } from 'node:crypto';
import { discordTaskChannelId } from './discord';
import { getDb } from './db';
import type { TaskAction } from './task-actions';

export type ReminderStatus = 'queued' | 'processing' | 'sent' | 'failed';

export interface Reminder extends TaskAction {
  id: string;
  channelId: string;
  remindAt: string;
  status: ReminderStatus;
  attempts: number;
  discordMessageId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface ReminderRow {
  id: string;
  task_key: string;
  title: string;
  owner: string;
  team: string;
  due_label: string;
  progress: number;
  task_state: TaskAction['state'];
  channel_id: string;
  remind_at: string;
  status: ReminderStatus;
  attempts: number;
  discord_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    taskKey: row.task_key,
    title: row.title,
    owner: row.owner,
    team: row.team,
    due: row.due_label,
    progress: row.progress,
    state: row.task_state,
    channelId: row.channel_id,
    remindAt: row.remind_at,
    status: row.status,
    attempts: row.attempts,
    discordMessageId: row.discord_message_id ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createReminder(
  task: TaskAction,
  remindAt: string,
  now = new Date(),
): Reminder {
  const db = getDb();
  const id = randomUUID();
  const timestamp = now.toISOString();
  const channelId = discordTaskChannelId();
  db.transaction(() => {
    // The sidebar exposes one countdown per task, so scheduling again replaces
    // an earlier queued reminder instead of producing duplicate notifications.
    db.prepare(`
      DELETE FROM reminders WHERE task_key = ? AND status = 'queued'
    `).run(task.taskKey);
    db.prepare(`
      INSERT INTO reminders (
        id, task_key, title, owner, team, due_label, progress, task_state,
        channel_id, remind_at, status, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)
    `).run(
      id, task.taskKey, task.title, task.owner, task.team, task.due, task.progress,
      task.state, channelId, remindAt, timestamp, timestamp,
    );
  })();
  return getReminder(id)!;
}

export function getReminder(id: string): Reminder | undefined {
  const row = getDb().prepare('SELECT * FROM reminders WHERE id = ?').get(id) as
    | ReminderRow
    | undefined;
  return row ? toReminder(row) : undefined;
}

export function listQueuedReminders(taskKey?: string): Reminder[] {
  const rows = taskKey
    ? getDb().prepare(`
        SELECT * FROM reminders
        WHERE task_key = ? AND status IN ('queued', 'processing')
        ORDER BY remind_at ASC
      `).all(taskKey)
    : getDb().prepare(`
        SELECT * FROM reminders
        WHERE status IN ('queued', 'processing')
        ORDER BY remind_at ASC
      `).all();
  return (rows as ReminderRow[]).map(toReminder);
}

export function claimDueReminders(now = new Date(), limit = 10): Reminder[] {
  const db = getDb();
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  return db.transaction(() => {
    db.prepare(`
      UPDATE reminders
      SET status = 'queued', updated_at = ?
      WHERE status = 'processing' AND updated_at <= ? AND attempts < 3
    `).run(nowIso, staleIso);
    db.prepare(`
      UPDATE reminders
      SET status = 'failed', last_error = COALESCE(last_error, 'Worker lease expired'),
          updated_at = ?
      WHERE status = 'processing' AND updated_at <= ? AND attempts >= 3
    `).run(nowIso, staleIso);

    const rows = db.prepare(`
      SELECT * FROM reminders
      WHERE status = 'queued' AND remind_at <= ?
      ORDER BY remind_at ASC
      LIMIT ?
    `).all(nowIso, limit) as ReminderRow[];

    const claim = db.prepare(`
      UPDATE reminders
      SET status = 'processing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'queued'
    `);
    const claimed: Reminder[] = [];
    for (const row of rows) {
      if (claim.run(nowIso, row.id).changes === 1) {
        claimed.push(toReminder({
          ...row,
          status: 'processing',
          attempts: row.attempts + 1,
          updated_at: nowIso,
        }));
      }
    }
    return claimed;
  })();
}

export function finishReminder(
  id: string,
  outcome: { sent: true; messageId: string } | { sent: false; error: string },
  now = new Date(),
): Reminder | undefined {
  const db = getDb();
  const current = getReminder(id);
  if (!current || current.status !== 'processing') return current;

  const timestamp = now.toISOString();
  if (outcome.sent) {
    db.prepare(`
      UPDATE reminders
      SET status = 'sent', discord_message_id = ?, last_error = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(outcome.messageId, timestamp, id);
  } else {
    const status: ReminderStatus = current.attempts >= 3 ? 'failed' : 'queued';
    db.prepare(`
      UPDATE reminders
      SET status = ?, last_error = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).run(status, outcome.error.slice(0, 500), timestamp, id);
  }
  return getReminder(id);
}
