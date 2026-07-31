import { ChannelType, type Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphApi } from './api';

const mistral = vi.hoisted(() => ({
  composeDM: vi.fn(),
  extractDelta: vi.fn(),
  triageReply: vi.fn(),
}));

vi.mock('./mistral', () => mistral);

import { handleDmReply } from './flows';

function dmMessage(content: string): {
  message: Message;
  reply: ReturnType<typeof vi.fn>;
} {
  const reply = vi.fn(async () => undefined);
  const message = {
    channel: { type: ChannelType.DM },
    author: { id: 'user.test' },
    id: 'message.test',
    content,
    reply,
  } as unknown as Message;
  return { message, reply };
}

function graphApi() {
  const getPersonSubgraph = vi.fn(async () => ({ nodes: [], edges: [] }));
  const postDelta = vi.fn(async () => ({ ok: true, changed: [] as string[] }));
  return {
    api: { getPersonSubgraph, postDelta } as unknown as GraphApi,
    getPersonSubgraph,
    postDelta,
  };
}

describe('handleDmReply Issue #6 feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes the noise classification visible without extracting a Delta', async () => {
    mistral.triageReply.mockResolvedValue('noise');
    const { message, reply } = dmMessage('Thanks!');
    const { api, getPersonSubgraph, postDelta } = graphApi();

    await handleDmReply(message, api);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Classified as noise'));
    expect(mistral.extractDelta).not.toHaveBeenCalled();
    expect(getPersonSubgraph).not.toHaveBeenCalled();
    expect(postDelta).not.toHaveBeenCalled();
  });

  it('makes the question classification visible without changing the graph', async () => {
    mistral.triageReply.mockResolvedValue('question');
    const { message, reply } = dmMessage('When is the review?');
    const { api, getPersonSubgraph, postDelta } = graphApi();

    await handleDmReply(message, api);

    expect(reply).toHaveBeenCalledWith('Classified as question.');
    expect(mistral.extractDelta).not.toHaveBeenCalled();
    expect(getPersonSubgraph).not.toHaveBeenCalled();
    expect(postDelta).not.toHaveBeenCalled();
  });

  it('shows an update classification when no supported graph change is extracted', async () => {
    mistral.triageReply.mockResolvedValue('update');
    mistral.extractDelta.mockResolvedValue({});
    const { message, reply } = dmMessage('I finished the migration today.');
    const { api, postDelta } = graphApi();

    await handleDmReply(message, api);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Classified as update'));
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("couldn't map it"));
    expect(postDelta).not.toHaveBeenCalled();
  });

  it('reports blocker classification, graph changes, and contradictions', async () => {
    const content = "runbook's done, but legal never got back to me — blocked.";
    mistral.triageReply.mockResolvedValue('blocker');
    mistral.extractDelta.mockResolvedValue({
      upsertNodes: [{ id: 'task.rollback-runbook' }],
      upsertEdges: [{ id: 'blocker.waiting-on-legal--BLOCKS--task.rollback-runbook' }],
    });
    const { message, reply } = dmMessage(content);
    const { api, postDelta } = graphApi();
    postDelta.mockResolvedValue({
      ok: true,
      changed: [
        'task.rollback-runbook',
        'blocker.waiting-on-legal--CONFLICTS_WITH--decision.legal-approvals-cleared',
      ],
    });

    await handleDmReply(message, api);

    expect(mistral.extractDelta).toHaveBeenCalledWith(
      content,
      { nodes: [], edges: [] },
      { kind: 'discord_dm', ref: 'message.test', quote: content },
    );
    expect(reply).toHaveBeenCalledWith(
      'Classified as blocker. I updated the project graph (2 changes) and detected 1 contradiction.',
    );
  });
});
