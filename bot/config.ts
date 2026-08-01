// Track D - Discord bot configuration.
// The bot holds no project state; it only reads env for how to connect and
// where to reach the graph API. See docs/CONTRACT.md Env for the shared keys.

export interface BotConfig {
  /** Bot login token. Required. Never logged. */
  token: string;
  /** Guild the demo runs in. Slash commands register here. Required. */
  guildId: string;
  /** Base URL of the Track A graph API. */
  apiBaseUrl: string;
  /** Check-in scheduler interval in ms. 0 (default) disables the scheduler. */
  checkinIntervalMs: number;
  /** Discord user ids the scheduler DMs each tick. Empty disables ticks. */
  checkinUserIds: string[];
  /** Poll interval for newly generated AI plans. 0 disables automatic dispatch. */
  planDispatchIntervalMs: number;
  /** Poll interval for dashboard follow-up requests. 0 disables the poller. */
  followupPollIntervalMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('PASTE_')) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in before running the bot.`,
    );
  }
  return value;
}

export function loadConfig(): BotConfig {
  return {
    token: requireEnv('DISCORD_BOT_TOKEN'),
    guildId: requireEnv('DISCORD_GUILD_ID'),
    apiBaseUrl: (process.env.API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, ''),
    checkinIntervalMs: Number.parseInt(process.env.CHECKIN_INTERVAL_MS ?? '0', 10) || 0,
    checkinUserIds: (process.env.CHECKIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    planDispatchIntervalMs: Math.max(
      0,
      Number.parseInt(process.env.PLAN_DISPATCH_INTERVAL_MS ?? '0', 10) || 0,
    ),
    followupPollIntervalMs: Math.max(
      0,
      Number.parseInt(process.env.FOLLOWUP_POLL_INTERVAL_MS ?? '2000', 10) || 0,
    ),
  };
}

/** Describe a token for logs without revealing any of it. */
export function redactToken(token: string): string {
  return `set (${token.length} chars)`;
}
