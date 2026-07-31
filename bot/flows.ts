// Track D - the loop from docs/GUIDE.md Part 2, in code.
// Outbound: read a person's subgraph, compose a DM, send it.
// Inbound: triage the reply, extract a Delta, post it. Nothing is cached here.

import { ChannelType, type Message, type User } from 'discord.js';
import type { SourceRef } from '../lib/types';
import type { GraphApi } from './api';
import { composeDM, extractDelta, triageReply } from './mistral';

const CONSENT_LINE =
  "I'm Athena. I'll store task updates, blockers, and source message IDs so the project graph stays current.";

// First-contact consent, tracked per Discord user for this process lifetime.
const contacted = new Set<string>();

function withConsent(userId: string, body: string): string {
  if (contacted.has(userId)) return body;
  contacted.add(userId);
  return `${CONSENT_LINE}\n\n${body}`;
}

/** Hour-0 proof: DM `hello` with consent on first contact. Returns what was sent. */
export async function sendHello(user: User): Promise<string> {
  const body = withConsent(user.id, 'hello');
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

  const message = withConsent(user.id, body);
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

  const triage = await triageReply(content);
  console.log(`[in] triage -> ${triage}`);
  if (triage === 'noise') {
    console.log('[in] noise - nothing written to the graph');
    await message.reply("Got it - I logged this as chatter, so I won't change the project graph.");
    return;
  }

  const source: SourceRef = { kind: 'discord_dm', ref: messageId, quote: content };

  const context = await api.getPersonSubgraph(userId);
  const delta = await extractDelta(content, context, source);

  const nodeCount = delta.upsertNodes?.length ?? 0;
  const edgeCount = delta.upsertEdges?.length ?? 0;
  if (nodeCount === 0 && edgeCount === 0) {
    console.log('[in] extraction produced an empty delta - nothing to post');
    await message.reply("Got it - I read your update, but I couldn't map it to a graph change yet.");
    return;
  }

  const result = await api.postDelta(delta);
  console.log(`[in] posted delta - changed: ${result.changed.join(', ') || '(none)'}`);
  await message.reply(
    `Got it - I updated the project graph (${result.changed.length} change${
      result.changed.length === 1 ? '' : 's'
    }).`,
  );
}

/** Server-channel helper: only answer when explicitly mentioned. */
export async function handleGuildMention(message: Message): Promise<void> {
  if (message.channel.type === ChannelType.DM) return;
  const botUser = message.client.user;
  if (!botUser || !message.mentions.users.has(botUser.id)) return;

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
