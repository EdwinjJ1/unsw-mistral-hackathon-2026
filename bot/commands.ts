// Track D - slash commands for the demo. Registered per-guild (instant, no
// global propagation wait). /athena-status is the manual trigger so the demo
// does not wait on the scheduler.

import {
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { GraphApi } from './api';
import { createDiscordRecipientDirectory, dispatchPlanHandoffs } from './dispatch';
import { sendCheckIn, sendHello } from './flows';

export const commandData = [
  new SlashCommandBuilder()
    .setName('athena-hello')
    .setDescription('Hour-0 proof: Athena DMs you, or a chosen user, a hello.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Who to DM. Defaults to you.').setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('athena-dispatch')
    .setDescription('Fetch the latest AI plan and dispatch every pending owner handoff.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('athena-status')
    .setDescription('Trigger a check-in DM now instead of waiting for the scheduler.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Who to check in with. Defaults to you.').setRequired(false),
    )
    .toJSON(),
];

/** Register commands to the demo guild. Guild-scoped so they appear immediately. */
export async function registerGuildCommands(client: Client, guildId: string): Promise<void> {
  if (!client.application) throw new Error('Client application unavailable - register after ready.');
  await client.application.commands.set(commandData, guildId);
  console.log(`[commands] registered ${commandData.length} guild commands for ${guildId}`);
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  api: GraphApi,
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (interaction.commandName === 'athena-dispatch') {
      if (!interaction.guildId) throw new Error('Run this command inside the configured server.');
      const result = await dispatchPlanHandoffs(
        createDiscordRecipientDirectory(interaction.client, interaction.guildId),
        api,
      );
      await interaction.editReply(
        `Plan ${result.planId}: ${result.sent} sent, ${result.unmatched} unmatched, ${result.failed} failed, ${result.skipped} already handled.`,
      );
      return;
    }
    if (interaction.commandName === 'athena-hello') {
      await sendHello(target);
      await interaction.editReply(`Sent a hello DM to ${target.username}.`);
      return;
    }
    if (interaction.commandName === 'athena-status') {
      await sendCheckIn(target, api);
      await interaction.editReply(`Sent a check-in DM to ${target.username}.`);
      return;
    }
    await interaction.editReply(`Unknown command: ${interaction.commandName}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[commands] ${interaction.commandName} failed:`, reason);
    await interaction.editReply(
      `Could not complete that - ${reason}. If it is a DM error, the target may have DMs disabled.`,
    );
  }
}
