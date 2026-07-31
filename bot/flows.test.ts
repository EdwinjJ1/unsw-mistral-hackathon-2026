import { ChannelType, type Message } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { handleGuildMention } from './flows';

interface MentionOptions {
  userMentioned?: boolean;
  assignedRoleIds?: string[];
  mentionedRoleIds?: string[];
}

function guildMessage(options: MentionOptions = {}): {
  message: Message;
  reply: ReturnType<typeof vi.fn>;
} {
  const guildId = 'guild.test';
  const reply = vi.fn(async () => undefined);
  const assignedRoles = [
    { id: guildId },
    ...(options.assignedRoleIds ?? []).map((id) => ({ id })),
  ];
  const mentionedRoles = new Set(options.mentionedRoleIds ?? []);

  const message = {
    channel: { type: ChannelType.GuildText },
    channelId: 'channel.test',
    client: { user: { id: 'bot.test' } },
    guildId,
    guild: {
      members: {
        me: {
          roles: {
            cache: {
              some: (predicate: (role: { id: string }) => boolean) =>
                assignedRoles.some(predicate),
            },
          },
        },
      },
    },
    mentions: {
      users: { has: (id: string) => id === 'bot.test' && options.userMentioned === true },
      roles: { has: (id: string) => mentionedRoles.has(id) },
    },
    author: { id: 'user.test' },
    id: 'message.test',
    content: 'hello Athena',
    reply,
  } as unknown as Message;

  return { message, reply };
}

describe('handleGuildMention', () => {
  it('replies to a direct bot user mention', async () => {
    const { message, reply } = guildMessage({ userMentioned: true });

    await handleGuildMention(message);

    expect(reply).toHaveBeenCalledOnce();
  });

  it('replies when an assigned Athena role is mentioned', async () => {
    const { message, reply } = guildMessage({
      assignedRoleIds: ['role.athena'],
      mentionedRoleIds: ['role.athena'],
    });

    await handleGuildMention(message);

    expect(reply).toHaveBeenCalledOnce();
  });

  it('ignores unrelated role mentions and the guild everyone role', async () => {
    const { message, reply } = guildMessage({
      assignedRoleIds: ['role.athena'],
      mentionedRoleIds: ['role.other', 'guild.test'],
    });

    await handleGuildMention(message);

    expect(reply).not.toHaveBeenCalled();
  });
});
