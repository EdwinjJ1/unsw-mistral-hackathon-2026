'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlan, fetchPlanHandoff, linkDiscordIdentity } from '@/lib/client-api';
import type { DeliveryPlan, PlanAssignment, PlanHandoffManifest } from '@/lib/types';
import styles from './plan.module.css';

const REASONS = {
  document_owner: 'Named in document',
  existing_owner: 'Existing owner preserved',
  department_workload: 'Balanced inside department',
} as const;

function Assignment({ item }: { item: PlanAssignment }) {
  return (
    <article className={styles.assignment}>
      <div className={styles.assignmentTop}>
        <span className={`${styles.status} ${styles[item.status]}`}>{item.status.replace('_', ' ')}</span>
        <span className={styles.department}>{item.department}</span>
      </div>
      <h3>{item.title}</h3>
      {item.description && <p>{item.description}</p>}
      <dl>
        <div><dt>Owner</dt><dd>{item.owner}</dd></div>
        <div><dt>Due</dt><dd>{item.dueDate ?? 'Not stated'}</dd></div>
        <div><dt>Assignment</dt><dd>{item.assignmentReason ? REASONS[item.assignmentReason] : 'Needs confirmation'}</dd></div>
        <div><dt>Discord</dt><dd>{item.discordUserId ?? 'No Discord ID'}</dd></div>
      </dl>
      {item.dependencyTaskIds.length > 0 && (
        <div className={styles.dependencies}>Waiting on {item.dependencyTaskIds.join(', ')}</div>
      )}
    </article>
  );
}

export default function PlanPage() {
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);
  const [handoff, setHandoff] = useState<PlanHandoffManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discordIds, setDiscordIds] = useState<Record<string, string>>({});
  const [binding, setBinding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextPlan, nextHandoff] = await Promise.all([fetchPlan(), fetchPlanHandoff()]);
      setPlan(nextPlan);
      setHandoff(nextHandoff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the plan.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const owners = useMemo(() => {
    if (handoff) return handoff.handoffs.map((item) => [item.ownerKey, item.assignments] as const);
    const groups = new Map<string, PlanAssignment[]>();
    for (const assignment of plan?.assignments ?? []) {
      const key = assignment.ownerId ?? `unassigned:${assignment.department}`;
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    }
    return [...groups.entries()] as Array<readonly [string, PlanAssignment[]]>;
  }, [handoff, plan]);

  const bindIdentity = async (event: FormEvent, ownerId: string) => {
    event.preventDefault();
    setBinding(ownerId);
    setError(null);
    try {
      await linkDiscordIdentity(ownerId, discordIds[ownerId] ?? '');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not link Discord identity.');
    } finally {
      setBinding(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><span>A</span><strong>ATHENA</strong></div>
        <nav><Link href="/">Organisation atlas</Link><Link href="/import">Analyse another document</Link></nav>
      </header>
      <section className={styles.intro}>
        <p>BOT HANDOFF / DISCORD</p>
        <h1>The delivery plan.</h1>
        <p>{plan?.summary ?? (error ? error : 'Building the exact assignment manifest…')}</p>
        {plan && (
          <div className={styles.meta}>
            <span>{plan.assignments.length} assignments</span>
            <span>{plan.clarificationQuestions.length} questions</span>
            <span>source · {plan.sourceName}</span>
            <a href="/api/plan/handoff" target="_blank" rel="noreferrer">BOT HANDOFF JSON ↗</a>
          </div>
        )}
      </section>

      {plan && (
        <div className={styles.content}>
          <section className={styles.manifest}>
            {owners.map(([ownerId, assignments], index) => (
              <div className={styles.ownerGroup} key={ownerId}>
                <header><span>{String(index + 1).padStart(2, '0')}</span><h2>{assignments[0].owner}</h2><small>{assignments[0].department}</small></header>
                {assignments[0].ownerId && !assignments[0].discordUserId && (
                  <form className={styles.identityForm} onSubmit={(event) => void bindIdentity(event, assignments[0].ownerId!)}>
                    <label htmlFor={`discord-${ownerId}`}>Discord user ID</label>
                    <input
                      id={`discord-${ownerId}`}
                      inputMode="numeric"
                      value={discordIds[assignments[0].ownerId] ?? ''}
                      onChange={(event) => setDiscordIds((current) => ({ ...current, [assignments[0].ownerId!]: event.target.value }))}
                      placeholder="Paste Discord ID to make this handoff sendable"
                      required
                    />
                    <button type="submit" disabled={binding === assignments[0].ownerId}>
                      {binding === assignments[0].ownerId ? 'Linking…' : 'Link identity'}
                    </button>
                  </form>
                )}
                <div className={styles.assignmentGrid}>
                  {assignments.map((assignment) => <Assignment item={assignment} key={assignment.taskId} />)}
                </div>
              </div>
            ))}
          </section>
          <aside className={styles.botPanel}>
            <p>DISCORD BOT QUEUE</p>
            <strong>{handoff?.counts.ready ?? 0} ready to dispatch</strong>
            <span>{plan.bot.instructions}</span>
            {handoff && (
              <div className={styles.queueStats}>
                <span>{handoff.counts.recipients} recipients</span>
                <span>{handoff.counts.missingIdentity} missing identity</span>
                <span>{handoff.counts.unassigned} unassigned</span>
                <span>{handoff.counts.sent} sent</span>
                <span>{handoff.counts.failed} failed</span>
              </div>
            )}
            {error && <p className={styles.panelError}>{error}</p>}
            <h2>Clarify before dispatch</h2>
            {plan.clarificationQuestions.length ? (
              <ol>{plan.clarificationQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
            ) : <p className={styles.clear}>No ownership questions. Every item has a route.</p>}
          </aside>
        </div>
      )}
    </main>
  );
}
