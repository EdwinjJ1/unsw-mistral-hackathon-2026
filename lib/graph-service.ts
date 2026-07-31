import { applyDelta, getGraph } from './graph';
import { findContradictions } from './mistral-bridge';
import type { Delta } from './types';
import { parseDelta } from './validation';

/**
 * The single application-level write path.
 *
 * A valid primary Delta is durable even if contradiction detection is
 * temporarily unavailable. Track E owns retries and model fallbacks; this
 * final guard prevents a successful write from being reported as failed.
 */
export async function applyDeltaWithSignals(delta: Delta): Promise<{ changed: string[] }> {
  const primary = applyDelta(delta);

  try {
    const signalEdges = await findContradictions(getGraph(), primary.changed);
    if (signalEdges.length === 0) return primary;

    const validated = parseDelta({ upsertEdges: signalEdges });
    const signals = applyDelta(validated);
    return { changed: [...new Set([...primary.changed, ...signals.changed])] };
  } catch (error) {
    console.error('Contradiction detection failed after applying the graph delta.', error);
    return primary;
  }
}
