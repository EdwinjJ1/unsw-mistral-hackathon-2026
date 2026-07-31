'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Graph } from '../../lib/types';
import { buildHighlightHref } from '../../lib/highlight';
import {
  createGraphPoller,
  type GraphPoller,
  type GraphPollingState,
} from '../../lib/signals-client';
import { detectSignals, type Signal } from '../../lib/signals';
import { getContradictionSources } from '../../lib/signals-view';

import styles from './signals.module.css';

const INITIAL_POLLING_STATE: GraphPollingState = {
  graph: null,
  error: null,
  loading: true,
};

const SEVERITY_LABELS: Record<Signal['severity'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Watch',
  low: 'Low',
};

function SignalCard({
  graph,
  nodeLabels,
  rank,
  signal,
}: {
  graph: Graph;
  nodeLabels: Map<string, string>;
  rank: number;
  signal: Signal;
}) {
  const contradictionSources = getContradictionSources(signal, graph);

  return (
    <Link
      className={`${styles.signalCard} ${styles[signal.severity]}`}
      href={buildHighlightHref(signal.nodeIds)}
    >
      <article>
        <div className={styles.cardHeader}>
          <span className={styles.rank}>{String(rank).padStart(2, '0')}</span>
          <span className={styles.severity}>
            <span className={styles.severityDot} aria-hidden="true" />
            {SEVERITY_LABELS[signal.severity]}
          </span>
          <span className={styles.inspect}>
            Inspect in graph
            <span aria-hidden="true">↗</span>
          </span>
        </div>

        <h2>{signal.title}</h2>
        <p className={styles.reason}>{signal.why}</p>

        {contradictionSources.length === 2 ? (
          <div
            className={styles.evidenceGrid}
            aria-label="Conflicting source evidence"
          >
            {contradictionSources.map((source) => (
              <figure className={styles.evidence} key={source.nodeId}>
                <figcaption>{source.label}</figcaption>
                <blockquote>“{source.quote}”</blockquote>
              </figure>
            ))}
          </div>
        ) : null}

        <div className={styles.nodes} aria-label="Affected graph nodes">
          {signal.nodeIds.map((nodeId) => (
            <span key={nodeId}>{nodeLabels.get(nodeId) ?? 'Unknown node'}</span>
          ))}
        </div>
      </article>
    </Link>
  );
}

export default function SignalsPage() {
  const [pollingState, setPollingState] = useState<GraphPollingState>(
    INITIAL_POLLING_STATE,
  );
  const pollerRef = useRef<GraphPoller | null>(null);

  useEffect(() => {
    const poller = createGraphPoller({
      onChange: setPollingState,
    });
    pollerRef.current = poller;
    void poller.start();

    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, []);

  const signals = useMemo(
    () =>
      pollingState.graph
        ? detectSignals(pollingState.graph, new Date())
        : [],
    [pollingState.graph],
  );

  const nodeLabels = useMemo(
    () =>
      new Map(
        pollingState.graph?.nodes.map((node) => [node.id, node.label]) ?? [],
      ),
    [pollingState.graph],
  );

  const retry = () => {
    void pollerRef.current?.refresh();
  };

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Signals navigation">
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              A
            </span>
            Athena
          </Link>
          <Link href="/" className={styles.graphLink}>
            Graph view
          </Link>
        </nav>

        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Hidden signals</p>
            <h1>What Athena noticed.</h1>
            <p className={styles.intro}>
              Problems nobody reported, inferred from the shape and freshness
              of the project graph.
            </p>
          </div>

          <div className={styles.liveStatus}>
            <span className={styles.liveDot} aria-hidden="true" />
            Live graph
            <small>Refreshes every 3 seconds</small>
          </div>
        </div>
      </header>

      {pollingState.graph && pollingState.error ? (
        <div className={styles.refreshWarning} role="status">
          <span>
            Showing the last good graph. Refresh failed: {pollingState.error}
          </span>
          <button type="button" onClick={retry}>
            Retry now
          </button>
        </div>
      ) : null}

      {pollingState.loading && !pollingState.graph ? (
        <section className={styles.statePanel} aria-live="polite">
          <span className={styles.scanner} aria-hidden="true" />
          <p>Reading the graph for hidden problems…</p>
        </section>
      ) : null}

      {!pollingState.loading &&
      !pollingState.graph &&
      pollingState.error ? (
        <section className={styles.statePanel} role="alert">
          <p className={styles.stateLabel}>Graph unavailable</p>
          <h2>Athena could not read the project.</h2>
          <p>{pollingState.error}</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </section>
      ) : null}

      {pollingState.graph ? (
        <section className={styles.results} aria-live="polite">
          <div className={styles.resultsHeader}>
            <p>
              <strong>{signals.length}</strong>{' '}
              {signals.length === 1 ? 'signal' : 'signals'} detected
            </p>
            <span>Ranked by urgency</span>
          </div>

          {signals.length > 0 ? (
            <div className={styles.signalList}>
              {signals.map((signal, index) => (
                <SignalCard
                  graph={pollingState.graph!}
                  key={`${signal.severity}:${signal.title}:${signal.nodeIds.join(',')}`}
                  nodeLabels={nodeLabels}
                  rank={index + 1}
                  signal={signal}
                />
              ))}
            </div>
          ) : (
            <div className={styles.clearState}>
              <span aria-hidden="true">✓</span>
              <div>
                <p className={styles.stateLabel}>All clear</p>
                <h2>No problems detected.</h2>
                <p>
                  Athena will keep watching as the graph changes.
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
