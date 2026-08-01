import { formatDiscordTask, type TaskAction } from './task-actions';

function discordToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token || token.startsWith('PASTE_') || token === 'ask_team_for_shared_token') {
    throw new Error('DISCORD_NOT_CONFIGURED');
  }
  return token;
}

export function discordTaskChannelId(): string {
  const channelId = process.env.DISCORD_TASK_CHANNEL_ID?.trim();
  if (!channelId) throw new Error('DISCORD_CHANNEL_NOT_CONFIGURED');
  return channelId;
}

export async function pushTaskToDiscord(task: TaskAction): Promise<string> {
  const endpoint = `https://discord.com/api/v10/channels/${encodeURIComponent(discordTaskChannelId())}/messages`;
  const body = JSON.stringify({
    content: formatDiscordTask(task),
    allowed_mentions: { parse: [] },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bot ${discordToken()}`,
        'content-type': 'application/json',
        'user-agent': 'DiscordBot (https://github.com/athena-org/athena, 0.1.0)',
      },
      body,
    });

    if (response.status === 429) {
      const rateLimit = await response.json().catch(() => ({})) as { retry_after?: unknown };
      const retryAfter = rateLimit.retry_after;
      if (typeof retryAfter !== 'number' || attempt === 2) {
        throw new Error('Discord rate limit could not be retried');
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Discord push failed (${response.status}) ${detail}`.trim());
    }

    const result = await response.json() as { id?: unknown };
    if (typeof result.id !== 'string') throw new Error('Discord did not return a message id');
    return result.id;
  }

  throw new Error('Discord push failed after retries');
}
