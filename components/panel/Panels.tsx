'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTeamDetail } from '@/lib/api';
import { claimOf, deriveTeamDetail, graphKpis, teamForNode } from '@/lib/derive';
import { freshness, formatDue } from '@/lib/time';
import type { Graph, GraphEdge, GraphNode, TeamDetail } from '@/lib/types';
import { useGraph } from '@/lib/useGraph';
import {
  Avatar,
  FreshnessChip,
  SectionTitle,
  SourceBadge,
  StatusPill,
} from '@/components/ui/Primitives';

function KpiTile({
  value,
  label,
  alert = false,
}: {
  value: number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className={`kpi-tile ${alert && value > 0 ? 'alert' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Quote({
  graph,
  nodeId,
}: {
  graph: Graph;
  nodeId: string;
}) {
  const claim = claimOf(graph, nodeId);
  return (
    <div className="conflict-quote">
      <span className="conflict-who">{claim.who}</span>
      <p>{claim.quote ? `“${claim.quote}”` : 'No verbatim quote captured.'}</p>
      <span className="quote-meta">
        {claim.at && <FreshnessChip at={claim.at} />}
        <SourceBadge source={claim.source} at={claim.at} align="left" />
      </span>
    </div>
  );
}

export function ContradictionCard({
  graph,
  edge,
}: {
  graph: Graph;
  edge: GraphEdge;
}) {
  return (
    <article className="contradiction-card">
      <p className="contradiction-eyebrow">⚠ Contradiction</p>
      <h3>{edge.note ?? 'Two teams are holding incompatible project facts.'}</h3>
      <div className="conflict-grid">
        <Quote graph={graph} nodeId={edge.from} />
        <Quote graph={graph} nodeId={edge.to} />
      </div>
      <div className="detection-source">
        <span>Detected by Athena</span>
        <SourceBadge source={edge.sourceRef} at={edge.updatedAt} />
      </div>
    </article>
  );
}

function ActivityTicker({ graph }: { graph: Graph }) {
  const rows = useMemo(
    () =>
      [...graph.nodes]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 6),
    [graph],
  );
  return (
    <div className="activity-ticker">
      {rows.map((node) => (
        <div className="activity-row" key={node.id}>
          <time>{new Date(node.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          <span className="activity-id">{node.id}</span>
          <span className={`activity-status status-${node.status ?? 'not_started'}`}>
            {node.status ? node.status.replace('_', ' ') : 'updated'}
          </span>
          <SourceBadge source={node.sourceRef} at={node.updatedAt} />
        </div>
      ))}
    </div>
  );
}

export function OverviewPanel() {
  const { graph, select } = useGraph();
  const kpis = graphKpis(graph);
  const topConflict = graph.edges.find((edge) => edge.type === 'CONFLICTS_WITH');
  const topTeam = topConflict ? teamForNode(graph, topConflict.from) : undefined;

  return (
    <div className="panel-scroll overview-panel">
      <header className="overview-header">
        <p className="eyebrow">Project intelligence</p>
        <h1>Athena sees the whole board.</h1>
        <p>Live project state, traced back to what people actually said.</p>
      </header>
      <div className="kpi-grid overview-kpis">
        <KpiTile value={kpis.teams} label="Teams" />
        <KpiTile value={kpis.openTasks} label="Open tasks" />
        <KpiTile value={kpis.blockers} label="Blockers" />
        <KpiTile value={kpis.contradictions} label="Contradictions" alert />
      </div>
      {topConflict && (
        <section>
          <SectionTitle>Highest-priority signal</SectionTitle>
          <ContradictionCard graph={graph} edge={topConflict} />
          {topTeam && (
            <button className="text-action" type="button" onClick={() => select(topTeam.id)}>
              Open {topTeam.label} detail →
            </button>
          )}
        </section>
      )}
      <section>
        <SectionTitle>Latest graph activity</SectionTitle>
        <ActivityTicker graph={graph} />
      </section>
      <PanelFooter />
    </div>
  );
}

function TeamHeader({ detail }: { detail: TeamDetail }) {
  const stale = [...detail.tasks, ...detail.blockers].filter(
    (node) => freshness(node.updatedAt) === 'stale',
  ).length;
  const blocked = [...detail.tasks, ...detail.blockers].filter(
    (node) => node.status === 'blocked',
  ).length;
  return (
    <header className="team-header">
      <div className="team-title-line">
        <h1 tabIndex={-1} id="team-panel-heading">
          {detail.team.label}
        </h1>
        <SourceBadge source={detail.team.sourceRef} at={detail.team.updatedAt} />
      </div>
      <div className="team-status-line">
        <StatusPill status={detail.team.status} />
        <FreshnessChip at={detail.team.updatedAt} />
      </div>
      <div className="kpi-grid">
        <KpiTile value={detail.tasks.length} label="Tasks" />
        <KpiTile value={blocked} label="Blocked" alert />
        <KpiTile value={stale} label="Stale" />
      </div>
    </header>
  );
}

function AiSummary({ team }: { team: GraphNode }) {
  return (
    <section className="ai-summary">
      <div className="section-heading">
        <p className="ai-eyebrow">◆ Athena · AI summary</p>
        <SourceBadge source={team.sourceRef} at={team.updatedAt} />
      </div>
      <p>{team.summary ?? 'Athena has not written a summary for this team yet.'}</p>
    </section>
  );
}

function TaskRow({
  task,
  graph,
  recent,
}: {
  task: GraphNode;
  graph: Graph;
  recent: boolean;
}) {
  const owner = task.ownerId
    ? graph.nodes.find((node) => node.id === task.ownerId)
    : undefined;
  return (
    <div className={`task-row ${recent ? 'row-changed' : ''}`} tabIndex={0}>
      <div className="task-row-main">
        <StatusPill status={task.status} />
        <span className="task-title">{task.label}</span>
        <span className="task-trace">
          <FreshnessChip at={task.updatedAt} />
          <SourceBadge source={task.sourceRef} at={task.updatedAt} />
        </span>
      </div>
      <div className="task-row-meta">
        {owner ? (
          <>
            <Avatar id={owner.id} label={owner.label} />
            <span>{owner.label}</span>
          </>
        ) : (
          <>
            <span className="unowned-avatar" />
            <span className="unowned-label">unowned</span>
          </>
        )}
        <span>· due {formatDue(task.dueDate)}</span>
      </div>
    </div>
  );
}

function DependencyRow({
  edge,
  graph,
}: {
  edge: GraphEdge;
  graph: Graph;
}) {
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);
  const targetTeam = to ? teamForNode(graph, to.id) : undefined;
  const { select, setHighlight } = useGraph();
  return (
    <div className="dependency-row">
      <button
        type="button"
        onClick={() => {
          setHighlight([edge.id, edge.from, edge.to]);
          if (targetTeam) select(targetTeam.id);
        }}
      >
        <span>{from?.label ?? edge.from}</span>
        <span className="waiting-on">→ waiting on →</span>
        <span>{targetTeam?.label ?? to?.label ?? edge.to}</span>
      </button>
      <SourceBadge source={edge.sourceRef} at={edge.updatedAt} />
    </div>
  );
}

function MemberRow({ member, graph }: { member: GraphNode; graph: Graph }) {
  const owned = graph.nodes.filter(
    (node) => node.type === 'Task' && node.ownerId === member.id,
  );
  return (
    <div className="member-row">
      <Avatar id={member.id} label={member.label} />
      <span className="member-copy">
        <strong>{member.label}</strong>
        <span>
          {owned.length
            ? owned.map((task) => task.label).join(' · ')
            : 'No task ownership recorded'}
        </span>
      </span>
      <SourceBadge source={member.sourceRef} at={member.updatedAt} />
    </div>
  );
}

function BlockerRow({ blocker }: { blocker: GraphNode }) {
  return (
    <div className="blocker-row">
      <span className="blocker-glyph">✕</span>
      <span className="blocker-copy">
        <strong>{blocker.label}</strong>
        <span>{blocker.summary}</span>
      </span>
      <span className="blocker-trace">
        <FreshnessChip at={blocker.updatedAt} />
        <SourceBadge source={blocker.sourceRef} at={blocker.updatedAt} />
      </span>
    </div>
  );
}

function PanelFooter() {
  return (
    <footer className="panel-footer">
      <span className="mistral-dot" />
      Powered by Mistral
      <span>· every fact remains traceable</span>
    </footer>
  );
}

export function TeamPanel({ teamId }: { teamId: string }) {
  const { graph, mock, isRecent } = useGraph();
  const [detail, setDetail] = useState<TeamDetail | null>(() =>
    deriveTeamDetail(graph, teamId),
  );

  useEffect(() => {
    let active = true;
    void fetchTeamDetail(teamId, graph, mock).then((next) => {
      if (active) setDetail(next);
    });
    return () => {
      active = false;
    };
  }, [graph, mock, teamId]);

  if (!detail) {
    return (
      <div className="panel-scroll">
        <p className="empty-copy">This team is not present in the current graph snapshot.</p>
      </div>
    );
  }

  return (
    <div className="panel-scroll team-panel">
      <TeamHeader detail={detail} />
      {detail.conflicts.length > 0 && (
        <section>
          {detail.conflicts.map((edge) => (
            <ContradictionCard graph={graph} edge={edge} key={edge.id} />
          ))}
        </section>
      )}
      <AiSummary team={detail.team} />
      <section>
        <SectionTitle count={detail.tasks.length}>Tasks · severity first</SectionTitle>
        <div className="task-list">
          {detail.tasks.map((task) => (
            <TaskRow task={task} graph={graph} recent={isRecent(task.id)} key={task.id} />
          ))}
        </div>
      </section>
      {detail.blockers.length > 0 && (
        <section>
          <SectionTitle count={detail.blockers.length}>Blockers</SectionTitle>
          <div className="blocker-list">
            {detail.blockers.map((blocker) => (
              <BlockerRow blocker={blocker} key={blocker.id} />
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionTitle count={detail.dependencies.length}>Cross-team dependencies</SectionTitle>
        {detail.dependencies.length ? (
          <div className="dependency-list">
            {detail.dependencies.map((edge) => (
              <DependencyRow edge={edge} graph={graph} key={edge.id} />
            ))}
          </div>
        ) : (
          <p className="empty-copy">No cross-team dependency recorded.</p>
        )}
      </section>
      <section>
        <SectionTitle count={detail.members.length}>Who owns what</SectionTitle>
        <div className="member-list">
          {detail.members.map((member) => (
            <MemberRow member={member} graph={graph} key={member.id} />
          ))}
        </div>
      </section>
      <PanelFooter />
    </div>
  );
}

export function Drawer() {
  const { selectedId, select } = useGraph();
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    window.setTimeout(() => {
      headingRef.current?.querySelector<HTMLElement>('#team-panel-heading')?.focus();
    }, 230);
  }, [selectedId]);

  return (
    <aside
      className="drawer"
      role="complementary"
      aria-label={selectedId ? 'Team detail' : 'Project overview'}
      ref={headingRef}
    >
      {selectedId && (
        <button
          className="drawer-close"
          type="button"
          aria-label="Close team detail"
          onClick={() => select(null)}
        >
          ×
        </button>
      )}
      {selectedId ? <TeamPanel teamId={selectedId} /> : <OverviewPanel />}
    </aside>
  );
}
