import type { Client } from 'discord.js';
import type {
  PlanDispatchReceipt,
  PlanHandoff,
  PlanHandoffManifest,
} from '../lib/types';
import { withFirstContactConsent } from './consent';

export interface PlanRecipient {
  id: string;
  send(message: string): Promise<{ id: string }>;
}

export interface PlanRecipientDirectory {
  fetchById(discordUserId: string): Promise<PlanRecipient>;
  findExact(displayName: string): Promise<PlanRecipient | null>;
}

export interface PlanDispatchApi {
  getPlanHandoff(): Promise<PlanHandoffManifest>;
  linkDiscordIdentity(personId: string, discordUserId: string): Promise<void>;
  postPlanDispatchReceipt(
    receipt: Omit<PlanDispatchReceipt, 'updatedAt'>,
  ): Promise<PlanDispatchReceipt>;
}

export interface PlanDispatchSummary {
  planId: string;
  sent: number;
  unmatched: number;
  failed: number;
  skipped: number;
}

export interface PlanDispatchOptions {
  /** Manual dispatch may retry a previous unmatched/failed receipt; polling should not. */
  retryPreviousFailures?: boolean;
}

const exact = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

/**
 * Resolve users against the configured guild. Missing graph identities are only
 * accepted when exactly one Discord username/global name/display name matches.
 */
export function createDiscordRecipientDirectory(
  client: Client,
  guildId: string,
): PlanRecipientDirectory {
  return {
    fetchById: (discordUserId) => client.users.fetch(discordUserId),
    async findExact(displayName) {
      const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
      const members = await guild.members.fetch({ query: displayName, limit: 100 });
      const target = exact(displayName);
      const matches = members.filter((member) => [
        member.user.username,
        member.user.globalName,
        member.displayName,
        member.nickname,
      ].some((candidate) => candidate && exact(candidate) === target));
      return matches.size === 1 ? matches.first()?.user ?? null : null;
    },
  };
}

function receiptFor(
  manifest: PlanHandoffManifest,
  handoff: PlanHandoff,
  status: 'sent' | 'unmatched' | 'failed',
  extras: { discordUserId?: string; messageId?: string; detail?: string } = {},
): Omit<PlanDispatchReceipt, 'updatedAt'> {
  return {
    planId: manifest.planId,
    ownerKey: handoff.ownerKey,
    ...(handoff.ownerId ? { ownerId: handoff.ownerId } : {}),
    owner: handoff.owner,
    ...(extras.discordUserId ? { discordUserId: extras.discordUserId } : {}),
    status,
    ...(extras.messageId ? { messageId: extras.messageId } : {}),
    ...(extras.detail ? { detail: extras.detail.slice(0, 500) } : {}),
  };
}

/** Fetch the latest AI plan handoff, DM every pending owner once, and save receipts. */
export async function dispatchPlanHandoffs(
  directory: PlanRecipientDirectory,
  api: PlanDispatchApi,
  options: PlanDispatchOptions = { retryPreviousFailures: true },
): Promise<PlanDispatchSummary> {
  const manifest = await api.getPlanHandoff();
  const summary: PlanDispatchSummary = {
    planId: manifest.planId,
    sent: 0,
    unmatched: 0,
    failed: 0,
    skipped: 0,
  };

  for (const handoff of manifest.handoffs) {
    if (
      handoff.status === 'sent'
      || (handoff.status !== 'pending' && !options.retryPreviousFailures)
    ) {
      summary.skipped += 1;
      continue;
    }

    let discordUserId = handoff.discordUserId;
    try {
      let recipient: PlanRecipient | null = null;
      if (discordUserId) {
        recipient = await directory.fetchById(discordUserId);
      } else if (handoff.ownerId) {
        recipient = await directory.findExact(handoff.owner);
        if (recipient) {
          discordUserId = recipient.id;
          await api.linkDiscordIdentity(handoff.ownerId, recipient.id);
        }
      }

      if (!recipient || !discordUserId) {
        await api.postPlanDispatchReceipt(receiptFor(manifest, handoff, 'unmatched', {
          detail: handoff.ownerId
            ? `No unique exact Discord roster match for “${handoff.owner}”.`
            : 'Assignment has no confirmed owner.',
        }));
        summary.unmatched += 1;
        continue;
      }

      const delivered = await recipient.send(
        withFirstContactConsent(recipient.id, handoff.message),
      );
      await api.postPlanDispatchReceipt(receiptFor(manifest, handoff, 'sent', {
        discordUserId,
        messageId: delivered.id,
      }));
      summary.sent += 1;
      console.log(`[plan] ${manifest.planId} -> ${handoff.owner} (${discordUserId})`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      try {
        await api.postPlanDispatchReceipt(receiptFor(manifest, handoff, 'failed', {
          ...(discordUserId ? { discordUserId } : {}),
          detail,
        }));
      } catch (receiptError) {
        console.error('[plan] could not save failed dispatch receipt:', receiptError);
      }
      summary.failed += 1;
      console.error(`[plan] ${manifest.planId} -> ${handoff.owner} failed:`, detail);
    }
  }

  return summary;
}
