// Track D - Athena Discord bot entry point.
//
// Run with: npm run bot:dev
//
// The bot logs in, registers guild slash commands, listens for DM replies, and
// runs the optional check-in scheduler. It holds no state: everything it knows
// comes from the graph API, everything it learns goes back through POST /api/delta.

import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { GraphApi } from './api';
import { handleCommand, registerGuildCommands } from './commands';
import { loadConfig, redactToken } from './config';
import { handleDmReply, handleGuildMention } from './flows';
import { startFollowupPoller, startPlanDispatcher, startScheduler } from './scheduler';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new GraphApi(config.apiBaseUrl);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
  });

  client.once(Events.ClientReady, async (ready) => {
    console.log(`[ready] Athena online as ${ready.user.tag} (${ready.user.id})`);
    console.log(`[ready] api base: ${config.apiBaseUrl}`);
    try {
      await registerGuildCommands(client, config.guildId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[ready] command registration failed:', reason);
    }
    startScheduler(client, api, config);
    startPlanDispatcher(client, api, config);
    startFollowupPoller(client, api, config);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleCommand(interaction, api).catch((error) => {
      console.error('[interaction] handler error:', error instanceof Error ? error.message : error);
    });
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;
    if (message.channel.type === ChannelType.DM) {
      void handleDmReply(message, api).catch((error) => {
        console.error('[message] handler error:', error instanceof Error ? error.message : error);
      });
      return;
    }

    void handleGuildMention(message).catch((error) => {
      console.error('[message] handler error:', error instanceof Error ? error.message : error);
    });
  });

  console.log(`[boot] logging in with token ${redactToken(config.token)}...`);
  await client.login(config.token);
}

main().catch((error) => {
  console.error('[fatal]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
