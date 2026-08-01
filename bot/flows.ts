// Track D - the loop from docs/GUIDE.md Part 2, in code.
// Outbound: read a person's subgraph, compose a DM, send it.
// Inbound: triage the reply, extract a Delta, post it. Nothing is cached here.

import { ChannelType, type Message, type User } from 'discord.js';
import type { SourceRef } from '../lib/types';
import type { GraphApi } from './api';
import { withFirstContactConsent } from './consent';
import { composeDM, extractDelta, triageReply } from './mistral';

/** Hour-0 proof: DM `hello` with consent on first contact. Returns what was sent. */
export async function sendHello(user: User): Promise<string> {
  const body = withFirstContactConsent(user.id, 'hello');
  await user.send(body);
  console.log(`[out] hello -> user ${user.id}`);
  return body;
}

/** Compose and send a check-in DM from the person's live subgraph. */
export async function sendCheckIn(user: User, api: GraphApi): Promise<string> {
  const subgraph = await api.getPersonSubgraph(user.id);
  const person = subgraph.nodes.find(
    (node) => node.type === 'Person' && node.discordUserId === user.id,
  );

  const body = person
    ? await composeDM(person, subgraph)
    : "Athena here. I couldn't find you in the project graph yet - reply with your name and what you're working on and I'll get you added.";

  const message = withFirstContactConsent(user.id, body);
  await user.send(message);
  console.log(`[out] check-in -> user ${user.id}${person ? '' : ' (not in graph)'}`);
  return message;
}

/** Inbound DM: log metadata, triage, extract a Delta, post it. */
export async function handleDmReply(message: Message, api: GraphApi): Promise<void> {
  const { id: messageId, content } = message;
  const userId = message.author.id;

  console.log('[in] DM reply', {
    discordUserId: userId,
    messageId,
    contentLength: content.length,
  });

  // Acknowledge receipt immediately so the sender sees the bot picked it up.
  await message.react('👍').catch((error) => {
    console.error('[in] could not react 👍:', error instanceof Error ? error.message : error);
  });

  const triage = await triageReply(content);
  console.log(`[in] triage -> ${triage}`);
  if (triage === 'noise') {
    console.log('[in] noise - nothing written to the graph');
    await message.reply(
      "Classified as noise. I logged this as chatter, so I won't change the project graph.",
    );
    return;
  }
  if (triage === 'question') {
    console.log('[in] question - nothing written to the graph');
    await message.reply('Classified as question.');
    return;
  }

  const source: SourceRef = { kind: 'discord_dm', ref: messageId, quote: content };

  const context = await api.getPersonSubgraph(userId);
  const delta = await extractDelta(content, context, source);

  const nodeCount = delta.upsertNodes?.length ?? 0;
  const edgeCount = delta.upsertEdges?.length ?? 0;
  if (nodeCount === 0 && edgeCount === 0) {
    console.log('[in] extraction produced an empty delta - nothing to post');
    await message.reply(
      `Classified as ${triage}. I read the reply, but I couldn't map it to an existing graph task or a supported graph change.`,
    );
    return;
  }

  const result = await api.postDelta(delta);
  const contradictionCount = result.changed.filter((id) =>
    id.includes('--CONFLICTS_WITH--'),
  ).length;
  console.log(`[in] posted delta - changed: ${result.changed.join(', ') || '(none)'}`);
  await message.reply(
    `Classified as ${triage}. I updated the project graph (${result.changed.length} change${
      result.changed.length === 1 ? '' : 's'
    })${
      contradictionCount > 0
        ? ` and detected ${contradictionCount} contradiction${contradictionCount === 1 ? '' : 's'}`
        : ''
    }.`,
  );
}

/** Server-channel helper: only answer when explicitly mentioned. */
export async function handleGuildMention(message: Message): Promise<void> {
  if (message.channel.type === ChannelType.DM) return;
  const botUser = message.client.user;
  if (!botUser) return;

  const userMentioned = message.mentions.users.has(botUser.id);
  const assignedRoleMentioned = message.guild?.members.me?.roles.cache.some(
    (role) =>
      role.id !== message.guildId &&
      message.mentions.roles.has(role.id),
  ) ?? false;
  if (!userMentioned && !assignedRoleMentioned) return;

  console.log('[guild] mention', {
    guildId: message.guildId,
    channelId: message.channelId,
    discordUserId: message.author.id,
    messageId: message.id,
    contentLength: message.content.length,
  });

  await message.reply(
    "I'm here. Use /athena-hello to test DMs, or /athena-status to trigger a project check-in.",
  );
}
