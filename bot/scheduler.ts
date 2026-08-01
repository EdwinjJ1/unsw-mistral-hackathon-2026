// Track D - the check-in scheduler. A plain setInterval; this is not a cron
// project. Disabled unless CHECKIN_INTERVAL_MS > 0 and at least one
// CHECKIN_USER_IDS entry is set.

import { Routes, type Client } from 'discord.js';
import { formatDiscordTask } from '../lib/task-actions';
import type { GraphApi } from './api';
import type { BotConfig } from './config';
import { createDiscordRecipientDirectory, dispatchPlanHandoffs } from './dispatch';
import { sendCheckIn } from './flows';

export function startScheduler(client: Client, api: GraphApi, config: BotConfig): () => void {
  const timers: ReturnType<typeof setInterval>[] = [];

  if (config.checkinIntervalMs <= 0 || config.checkinUserIds.length === 0) {
    console.log('[scheduler] disabled (set CHECKIN_INTERVAL_MS and CHECKIN_USER_IDS to enable)');
  } else {
    console.log(
      `[scheduler] every ${config.checkinIntervalMs}ms for ${config.checkinUserIds.length} user(s)`,
    );

    const checkinTimer = setInterval(() => {
      void (async () => {
        for (const userId of config.checkinUserIds) {
          try {
            const user = await client.users.fetch(userId);
            await sendCheckIn(user, api);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`[scheduler] check-in to ${userId} failed:`, reason);
          }
        }
      })();
    }, config.checkinIntervalMs);
    checkinTimer.unref?.();
    timers.push(checkinTimer);
  }

  if (config.reminderPollIntervalMs > 0) {
    console.log(`[reminders] polling every ${config.reminderPollIntervalMs}ms`);
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const reminders = await api.claimDueReminders();
        for (const reminder of reminders) {
          try {
            const result = await client.rest.post(Routes.channelMessages(reminder.channelId), {
              body: {
                content: formatDiscordTask(reminder, true),
                allowed_mentions: { parse: [] },
              },
            }) as { id?: unknown };
            if (typeof result.id !== 'string') throw new Error('Discord did not return a message id');
            await api.finishReminder(reminder.id, { sent: true, messageId: result.id });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`[reminders] ${reminder.id} delivery failed:`, reason);
            await api.finishReminder(reminder.id, { sent: false, error: reason }).catch(
              (finishError) => console.error(
                `[reminders] ${reminder.id} release failed:`,
                finishError instanceof Error ? finishError.message : finishError,
              ),
            );
          }
        }
      } catch (error) {
        console.error(
          '[reminders] poll failed:',
          error instanceof Error ? error.message : error,
        );
      } finally {
        polling = false;
      }
    };
    const reminderTimer = setInterval(() => void poll(), config.reminderPollIntervalMs);
    reminderTimer.unref?.();
    timers.push(reminderTimer);
    void poll();
  } else {
    console.log('[reminders] disabled (set REMINDER_POLL_INTERVAL_MS to enable)');
  }

  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}

/** Poll the handoff endpoint so each newly generated AI plan reaches Discord. */
export function startPlanDispatcher(client: Client, api: GraphApi, config: BotConfig): () => void {
  if (config.planDispatchIntervalMs <= 0) {
    console.log('[plan] automatic dispatch disabled (set PLAN_DISPATCH_INTERVAL_MS > 0 to enable)');
    return () => {};
  }

  const directory = createDiscordRecipientDirectory(client, config.guildId);
  let inFlight = false;
  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await dispatchPlanHandoffs(directory, api, {
        retryPreviousFailures: false,
      });
      if (result.sent || result.unmatched || result.failed) {
        console.log('[plan] dispatch complete', result);
      }
    } catch (error) {
      console.error('[plan] dispatch poll failed:', error instanceof Error ? error.message : error);
    } finally {
      inFlight = false;
    }
  };

  console.log(`[plan] polling AI handoffs every ${config.planDispatchIntervalMs}ms`);
  void run();
  const timer = setInterval(() => void run(), config.planDispatchIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
