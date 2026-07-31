import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeDb, resetDb } from './db';
import {
  claimDueReminders,
  createReminder,
  finishReminder,
  getReminder,
  listQueuedReminders,
} from './reminders';
import { formatDiscordTask, type TaskAction } from './task-actions';

const NOW = new Date('2026-07-31T06:00:00.000Z');
const TASK: TaskAction = {
  taskKey: 'engineering:0',
  title: 'Atlas API migration',
  owner: 'Marcus Lee',
  team: 'Engineering',
  due: '08 Aug',
  progress: 72,
  state: 'Active',
};
let testDirectory = '';

beforeEach(() => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-reminder-test-'));
  process.env.DATABASE_PATH = path.join(testDirectory, 'test.db');
  process.env.DISCORD_TASK_CHANNEL_ID = '123456789012345678';
  resetDb();
});

afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  delete process.env.DISCORD_TASK_CHANNEL_ID;
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('persistent reminders', () => {
  it('claims only due work once and records delivery', () => {
    const due = createReminder(TASK, new Date(NOW.getTime() - 1_000).toISOString(), NOW);
    createReminder(
      { ...TASK, taskKey: 'engineering:1' },
      new Date(NOW.getTime() + 60_000).toISOString(),
      NOW,
    );

    const claimed = claimDueReminders(NOW);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.id, due.id);
    assert.equal(claimed[0]?.attempts, 1);
    assert.equal(claimDueReminders(NOW).length, 0);

    const finished = finishReminder(
      due.id,
      { sent: true, messageId: 'discord-message-1' },
      new Date(NOW.getTime() + 2_000),
    );
    assert.equal(finished?.status, 'sent');
    assert.equal(finished?.discordMessageId, 'discord-message-1');
    assert.equal(listQueuedReminders().length, 1);
  });

  it('requeues failures and stops after three attempts', () => {
    const reminder = createReminder(TASK, new Date(NOW.getTime() - 1_000).toISOString(), NOW);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const [claimed] = claimDueReminders(new Date(NOW.getTime() + attempt * 1_000));
      assert.equal(claimed?.attempts, attempt);
      finishReminder(
        reminder.id,
        { sent: false, error: `network ${attempt}` },
        new Date(NOW.getTime() + attempt * 1_000 + 100),
      );
    }
    assert.equal(getReminder(reminder.id)?.status, 'failed');
    assert.equal(getReminder(reminder.id)?.lastError, 'network 3');
  });
});

describe('Discord task formatting', () => {
  it('stays within Discord message content limits', () => {
    const message = formatDiscordTask({ ...TASK, title: 'x'.repeat(180) }, true);
    assert.ok(message.length <= 2_000);
    assert.match(message, /TASK REMINDER/);
    assert.match(message, /Progress: 72%/);
  });
});
