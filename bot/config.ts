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
  /** Poll interval for persistent task reminders. 0 disables reminder delivery. */
  reminderPollIntervalMs: number;
  /** Shared server/worker secret for reminder queue routes. */
  reminderWorkerSecret?: string;
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
    reminderPollIntervalMs:
      Number.parseInt(process.env.REMINDER_POLL_INTERVAL_MS ?? '15000', 10) || 0,
    reminderWorkerSecret: process.env.REMINDER_WORKER_SECRET?.trim() || undefined,
  };
}

/** Describe a token for logs without revealing any of it. */
export function redactToken(token: string): string {
  return `set (${token.length} chars)`;
}
