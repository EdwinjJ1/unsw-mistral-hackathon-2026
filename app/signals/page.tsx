'use client';

import { useRouter } from 'next/navigation';
import { ContradictionCard } from '@/components/panel/Panels';
import { FreshnessChip, SourceBadge } from '@/components/ui/Primitives';
import { freshness } from '@/lib/time';
import type { GraphNode, Status } from '@/lib/types';
import { useGraph } from '@/lib/useGraph';

interface Signal {
  id: string;
  severity: Status;
  kind: string;
  title: string;
  why: string;
  nodeIds: string[];
  sourceNode?: GraphNode;
}

export default function SignalsPage() {
  const router = useRouter();
  const { graph, mock, setHighlight } = useGraph();
  const conflict = graph.edges.find((edge) => edge.type === 'CONFLICTS_WITH');
  const unowned = graph.nodes.find(
    (node) => node.type === 'Task' && !node.ownerId && node.status !== 'done',
  );
  const stale = graph.nodes.filter(
    (node) => node.type === 'Task' && node.status !== 'done' && freshness(node.updatedAt) === 'stale',
  );
  const blocked = graph.nodes.filter(
    (node) => node.type === 'Blocker' && node.status === 'blocked',
  );

  const signals: Signal[] = [
    ...(unowned
      ? [
          {
            id: 'unowned',
            severity: 'at_risk' as const,
            kind: 'Ownership gap',
            title: `${unowned.label} has no owner`,
            why: 'A launch-critical task can quietly miss its deadline when nobody is accountable for moving it.',
            nodeIds: [unowned.id, unowned.teamId ?? ''],
            sourceNode: unowned,
          },
        ]
      : []),
    ...(stale.length
      ? [
          {
            id: 'stale',
            severity: 'not_started' as const,
            kind: 'Information decay',
            title: `${stale.length} open fact${stale.length === 1 ? '' : 's'} ha${stale.length === 1 ? 's' : 've'} gone stale`,
            why: 'Athena has not seen a recent human confirmation, so these facts deserve a check-in before the launch decision.',
            nodeIds: stale.map((node) => node.id),
            sourceNode: stale[0],
          },
        ]
      : []),
    ...(blocked.length
      ? [
          {
            id: 'blockers',
            severity: 'blocked' as const,
            kind: 'Cross-team drag',
            title: `${blocked.length} blocker${blocked.length === 1 ? '' : 's'} cross team boundaries`,
            why: 'The work is not just late inside one team; it depends on information or action held somewhere else.',
            nodeIds: blocked.map((node) => node.id),
            sourceNode: blocked[0],
          },
        ]
      : []),
  ];

  const showInGraph = (ids: string[]) => {
    const teamIds = ids.flatMap((id) => {
      const node = graph.nodes.find((item) => item.id === id);
      return node?.type === 'Team' ? [node.id] : node?.teamId ? [node.teamId] : [];
    });
    const clean = [...new Set([...teamIds, ...ids.filter(Boolean)])];
    setHighlight(clean);
    router.push(`/${mock ? '?mock=1' : ''}`);
  };

  return (
    <main className="page signals-page">
      <header className="narrative-header">
        <p className="eyebrow">Hidden signals</p>
        <h1 className="page-title">What Athena noticed on its own</h1>
        <p className="page-subtitle">Nobody reported any of this.</p>
      </header>

      <div className="signals-list">
        {conflict && (
          <section className="signal-feature">
            <div className="signal-context">
              <span className="signal-severity blocked">Critical · contradiction</span>
              <button
                type="button"
                className="text-action"
                onClick={() => showInGraph([conflict.id, conflict.from, conflict.to])}
              >
                Show in graph →
              </button>
            </div>
            <ContradictionCard graph={graph} edge={conflict} />
          </section>
        )}
        {signals.map((signal) => (
          <article className={`signal-card severity-${signal.severity}`} key={signal.id}>
            <div className="signal-card-top">
              <span className={`signal-severity ${signal.severity}`}>
                {signal.severity.replace('_', ' ')} · {signal.kind}
              </span>
              {signal.sourceNode && (
                <span className="signal-trace">
                  <FreshnessChip at={signal.sourceNode.updatedAt} />
                  <SourceBadge
                    source={signal.sourceNode.sourceRef}
                    at={signal.sourceNode.updatedAt}
                  />
                </span>
              )}
            </div>
            <h2>{signal.title}</h2>
            <p>{signal.why}</p>
            <div className="node-chips">
              {signal.nodeIds.slice(0, 4).filter(Boolean).map((id) => (
                <code key={id}>{id}</code>
              ))}
            </div>
            <button
              type="button"
              className="text-action"
              onClick={() => showInGraph(signal.nodeIds)}
            >
              Show in graph →
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
