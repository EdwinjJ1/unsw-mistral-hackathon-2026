// Track D - the check-in scheduler. A plain setInterval; this is not a cron
// project. Disabled unless CHECKIN_INTERVAL_MS > 0 and at least one
// CHECKIN_USER_IDS entry is set.

import type { Client } from 'discord.js';
import type { GraphApi } from './api';
import type { BotConfig } from './config';
import { createDiscordRecipientDirectory, dispatchPlanHandoffs } from './dispatch';
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

/** Poll the follow-up queue: each dashboard 跟进 click becomes real Discord DMs. */
export function startFollowupPoller(client: Client, api: GraphApi, config: BotConfig): () => void {
  if (config.followupPollIntervalMs <= 0) {
    console.log('[followup] poller disabled (set FOLLOWUP_POLL_INTERVAL_MS > 0 to enable)');
    return () => {};
  }

  const directory = createDiscordRecipientDirectory(client, config.guildId);
  let inFlight = false;
  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const requests = await api.getPlanFollowups();
      for (const request of requests) {
        console.log(
          `[followup] request #${request.id}${request.teamLabel ? ` (${request.teamLabel})` : ''}`
          + ` -> ${request.ownerKeys.length} owner(s)`,
        );
        const result = await dispatchPlanHandoffs(directory, api, {
          retryPreviousFailures: true,
          ownerKeys: request.ownerKeys,
        });
        console.log(`[followup] request #${request.id} dispatched`, result);
        await api.consumePlanFollowup(request.id);
      }
    } catch (error) {
      console.error('[followup] poll failed:', error instanceof Error ? error.message : error);
    } finally {
      inFlight = false;
    }
  };

  console.log(`[followup] polling dashboard requests every ${config.followupPollIntervalMs}ms`);
  const timer = setInterval(() => void run(), config.followupPollIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
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
