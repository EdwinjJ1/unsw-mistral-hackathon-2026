import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { GraphApi } from './api';
import { commandData, handleCommand } from './commands';

function ingestInteraction(text: string) {
  const deferReply = vi.fn(async () => undefined);
  const editReply = vi.fn(async () => undefined);
  const interaction = {
    commandName: 'athena-ingest',
    user: { id: 'user.test', username: 'tester' },
    options: {
      getUser: () => null,
      getString: (name: string) => (name === 'text' ? text : null),
    },
    deferReply,
    editReply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, deferReply, editReply };
}

describe('Issue #6 manual commands', () => {
  it('registers athena-ingest alongside the existing commands', () => {
    expect(commandData.map((command) => command.name)).toEqual([
      'athena-hello',
      'athena-status',
      'athena-ingest',
    ]);
  });

  it('reports generated node and edge counts for athena-ingest', async () => {
    const ingestText = vi.fn(async () => ({
      upsertNodes: [{ id: 'team.engineering' }, { id: 'task.runbook' }],
      upsertEdges: [{ id: 'team.engineering--OWNS--task.runbook' }],
    }));
    const api = { ingestText } as unknown as GraphApi;
    const { interaction, editReply } = ingestInteraction('# Engineering Team');

    await handleCommand(interaction, api);

    expect(ingestText).toHaveBeenCalledWith('# Engineering Team');
    expect(editReply).toHaveBeenCalledWith(
      'Issue #6 generateGraphFromText produced and applied 2 nodes and 1 edge.',
    );
  });
});
