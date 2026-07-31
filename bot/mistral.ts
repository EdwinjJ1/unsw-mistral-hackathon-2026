// Track D - Mistral seam.
//
// docs/CONTRACT.md Mistral says only lib/mistral/* imports the Mistral SDK, and
// everyone else imports from there. Track E may not have landed yet, so this
// module tries to import the real implementation and otherwise falls back to
// deterministic, demo-safe versions. When Track E ships, the bot picks it up
// with no code change here.

import type { Delta, Graph, GraphNode, SourceRef } from '../lib/types';
import { edgeId, nodeId } from '../lib/types';

type TriageResult = 'update' | 'blocker' | 'question' | 'noise';

interface MistralModule {
  triageReply(text: string): Promise<TriageResult>;
  extractDelta(text: string, context: Graph, source: SourceRef): Promise<Delta>;
  composeDM(person: GraphNode, subgraph: Graph): Promise<string>;
}

let cached: Partial<MistralModule> | null | undefined;

async function loadTrackE(): Promise<Partial<MistralModule> | null> {
  if (cached !== undefined) return cached ?? null;

  const candidates = ['../lib/mistral/index.ts', '../lib/mistral'];
  for (const specifier of candidates) {
    try {
      const mod = (await import(/* @vite-ignore */ specifier)) as Partial<MistralModule>;
      if (mod && (mod.triageReply || mod.extractDelta || mod.composeDM)) {
        console.log('[mistral] using Track E implementation');
        cached = mod;
        return mod;
      }
    } catch {
      // Track E not present under this specifier - try the next / fall back.
    }
  }

  cached = null;
  return null;
}

export async function triageReply(text: string): Promise<TriageResult> {
  const trackE = await loadTrackE();
  if (trackE?.triageReply) return trackE.triageReply(text);
  return fallbackTriage(text);
}

export async function extractDelta(
  text: string,
  context: Graph,
  source: SourceRef,
): Promise<Delta> {
  const trackE = await loadTrackE();
  if (trackE?.extractDelta) return trackE.extractDelta(text, context, source);
  return fallbackExtractDelta(text, context, source);
}

export async function composeDM(person: GraphNode, subgraph: Graph): Promise<string> {
  const trackE = await loadTrackE();
  if (trackE?.composeDM) return trackE.composeDM(person, subgraph);
  return fallbackComposeDM(person, subgraph);
}

const BLOCKER_WORDS = ['block', 'blocked', 'stuck', 'waiting', 'wait on', "can't", 'cannot', 'unable'];
const DONE_WORDS = ['done', 'finished', 'complete', 'completed', 'shipped', 'merged', 'wrapped up'];
const QUESTION_WORDS = ['which', 'should i', 'do we', 'can we', 'what about', 'when is'];
const NOISE_WORDS = ['thanks', 'thank you', 'ok', 'okay', 'cool', 'got it', 'sure', 'hi', 'hey', 'hello'];

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fallbackTriage(text: string): TriageResult {
  const normalised = normalise(text);
  if (!normalised) return 'noise';
  if (BLOCKER_WORDS.some((word) => normalised.includes(word))) return 'blocker';
  if (normalised.endsWith('?') || QUESTION_WORDS.some((word) => normalised.includes(word))) {
    return 'question';
  }

  const stripped = normalised.replace(/[^\p{Letter}\p{Number} ]/gu, '').trim();
  if (
    stripped.length <= 24 &&
    NOISE_WORDS.some(
      (word) => stripped === word || stripped.startsWith(`${word} `) || stripped.endsWith(` ${word}`),
    )
  ) {
    return 'noise';
  }

  return 'update';
}

function pickTargetTask(text: string, context: Graph): GraphNode | undefined {
  const words = new Set(normalise(text).split(' ').filter((word) => word.length > 3));
  const tasks = context.nodes.filter((node) => node.type === 'Task');
  let best: GraphNode | undefined;
  let bestScore = 0;

  for (const task of tasks) {
    const score = normalise(task.label)
      .split(' ')
      .filter((word) => words.has(word)).length;
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }

  if (best) return best;
  return tasks.find((node) => node.status !== 'done') ?? tasks[0];
}

function fallbackExtractDelta(text: string, context: Graph, source: SourceRef): Delta {
  const task = pickTargetTask(text, context);
  if (!task) return {};

  const now = new Date().toISOString();
  const triage = fallbackTriage(text);
  const normalised = normalise(text);
  const status = DONE_WORDS.some((word) => normalised.includes(word))
    ? 'done'
    : triage === 'blocker'
      ? 'blocked'
      : 'in_progress';
  const quote = source.quote?.slice(0, 240) ?? text.slice(0, 240);

  const upsertNodes: GraphNode[] = [
    { ...task, status, summary: quote, updatedAt: now, sourceRef: source },
  ];
  const delta: Delta = { upsertNodes };

  if (triage === 'blocker') {
    const blockerLabel = `Blocker on ${task.label}`;
    const blockerId = nodeId('Blocker', blockerLabel);
    upsertNodes.push({
      id: blockerId,
      type: 'Blocker',
      label: blockerLabel,
      teamId: task.teamId,
      status: 'blocked',
      summary: quote,
      updatedAt: now,
      sourceRef: source,
    });
    delta.upsertEdges = [
      {
        id: edgeId(blockerId, 'BLOCKS', task.id),
        from: blockerId,
        to: task.id,
        type: 'BLOCKS',
        note: quote,
        updatedAt: now,
        sourceRef: source,
      },
    ];
  }

  return delta;
}

function fallbackComposeDM(person: GraphNode, subgraph: Graph): string {
  const tasks = subgraph.nodes.filter(
    (node) => node.type === 'Task' && node.ownerId === person.id,
  );
  const nodeById = new Map(subgraph.nodes.map((node) => [node.id, node]));

  const lines: string[] = [];
  lines.push(`Hi ${person.label} - Athena checking in on your work.`);

  if (tasks.length === 0) {
    lines.push("I don't see any tasks assigned to you yet. What are you working on right now?");
    return lines.join('\n');
  }

  for (const task of tasks) {
    const due = task.dueDate ? `, due ${task.dueDate}` : '';
    const status = task.status ? ` [${task.status}]` : '';
    lines.push(`\n- ${task.label}${status}${due}`);

    const deps = subgraph.edges.filter((edge) => edge.type === 'DEPENDS_ON' && edge.from === task.id);
    for (const dep of deps) {
      const target = nodeById.get(dep.to);
      if (target) {
        lines.push(`   -> depends on "${target.label}" - check in with them before you finish this.`);
      }
    }
  }

  lines.push("\nReply here with where each of these stands, or what's blocking you.");
  return lines.join('\n');
}
