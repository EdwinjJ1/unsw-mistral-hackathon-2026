// Track D - the check-in scheduler. A plain setInterval; this is not a cron
// project. Disabled unless CHECKIN_INTERVAL_MS > 0 and at least one
// CHECKIN_USER_IDS entry is set.

import type { Client } from 'discord.js';
import type { GraphApi } from './api';
import type { BotConfig } from './config';
import { sendCheckIn } from './flows';

export function startScheduler(client: Client, api: GraphApi, config: BotConfig): () => void {
  if (config.checkinIntervalMs <= 0 || config.checkinUserIds.length === 0) {
    console.log('[scheduler] disabled (set CHECKIN_INTERVAL_MS and CHECKIN_USER_IDS to enable)');
    return () => {};
  }

  console.log(
    `[scheduler] every ${config.checkinIntervalMs}ms for ${config.checkinUserIds.length} user(s)`,
  );

  const timer = setInterval(() => {
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

  timer.unref?.();
  return () => clearInterval(timer);
}
