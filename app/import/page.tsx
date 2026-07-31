'use client';

import { DragEvent, FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ingestText } from '@/lib/api';
import type { Delta, GraphEdge, GraphNode } from '@/lib/types';
import { useGraph } from '@/lib/useGraph';

const EXAMPLES = {
  'Meeting notes': `Launch readiness — Friday

Engineering says the auth service shipped on Thursday. Ops still needs confirmation before cutover.
Priya owns the rollback runbook, due tomorrow, and needs Legal to confirm whether retention is 14 or 30 days.
The observability dashboard is still unowned.`,
  'PR description': `PR: Add retention window enforcement

Implements the policy hook required by the rollback runbook. Waiting on Legal to confirm the final duration.
Owner: Priya Shah. Target: before launch cutover.`,
  'Spec excerpt': `Rollback policy v2

Every production release must retain the previous deploy artefact. The retention duration is pending Legal approval.
Operations cannot sign off the cutover checklist until the policy is published.`,
  'Slack export': `[09:12] Marcus: auth is live in production
[09:14] Amara: we're still waiting on auth confirmation; cutover is blocked
[09:16] Priya: runbook is drafted but the retention window is unclear`,
};

type ReceiptItem =
  | { verb: '+'; item: GraphNode }
  | { verb: '~'; item: GraphNode }
  | { verb: '+'; item: GraphEdge };

function Receipt({ delta, onGraph }: { delta: Delta; onGraph(): void }) {
  const nodeCount = delta.upsertNodes?.length ?? 0;
  const edgeCount = delta.upsertEdges?.length ?? 0;
  const items: ReceiptItem[] = [
    ...(delta.upsertNodes ?? []).map((item) => ({ verb: '+' as const, item })),
    ...(delta.upsertEdges ?? []).map((item) => ({ verb: '+' as const, item })),
  ];
  return (
    <section className="receipt" aria-live="polite">
      <p className="receipt-heading">
        Applied · {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} · {edgeCount}{' '}
        {edgeCount === 1 ? 'edge' : 'edges'}
      </p>
      <div className="receipt-list">
        {items.map(({ verb, item }) => (
          <div className="receipt-row" key={item.id}>
            <span className={verb === '+' ? 'receipt-add' : 'receipt-update'}>{verb}</span>
            <span className="receipt-type">{'type' in item ? item.type : 'Node'}</span>
            <code>{item.id.replace(/^[^.]+\./, '')}</code>
            <span className="receipt-source">DOC</span>
          </div>
        ))}
      </div>
      <button type="button" className="receipt-cta" onClick={onGraph}>
        See it in the graph →
      </button>
    </section>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const { mock, setHighlight, applyLocalDelta } = useGraph();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Delta | null>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md'].includes(extension ?? '')) {
      setError('This demo accepts .txt and .md. Paste extracted PDF or document text here.');
      return;
    }
    setText(await file.text());
    setError(null);
    setReceipt(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setReceipt(null);
    try {
      const delta = await ingestText(text, mock);
      setReceipt(delta);
      applyLocalDelta(delta);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Athena could not read this source. The graph has not been changed.',
      );
    } finally {
      setLoading(false);
    }
  };

  const showGraph = () => {
    if (!receipt) return;
    const teamIds = (receipt.upsertNodes ?? [])
      .map((node) => node.teamId)
      .filter((id): id is string => Boolean(id));
    const ids = [
      ...teamIds,
      ...(receipt.upsertNodes ?? []).map((node) => node.id),
      ...(receipt.upsertEdges ?? []).map((edge) => edge.id),
    ];
    setHighlight(ids);
    router.push(`/${mock ? '?mock=1' : ''}`);
  };

  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };

  return (
    <main className="page import-page">
      <header className="narrative-header">
        <p className="eyebrow">Bring your own context</p>
        <h1 className="page-title">Paste anything.</h1>
        <p className="page-subtitle">Athena turns it into graph.</p>
      </header>

      <form
        className={dragging ? 'import-form dragging' : 'import-form'}
        onSubmit={submit}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="example-row">
          {Object.entries(EXAMPLES).map(([label, example]) => (
            <button
              type="button"
              className="example-chip"
              key={label}
              onClick={() => {
                setText(example);
                setError(null);
                setReceipt(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="textarea-wrap">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setReceipt(null);
            }}
            placeholder="Paste meeting notes, a PR description, a spec excerpt, or exported conversation…&#10;&#10;For PDFs and documents, paste extracted text. This demo intentionally does not pretend to parse formats it cannot read."
            aria-label="Source text to import"
          />
          <button
            type="button"
            className="file-button"
            onClick={() => fileInput.current?.click()}
          >
            ↑ Upload .txt / .md
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            hidden
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {dragging && <div className="drop-message">Drop source text here</div>}
        </div>
        <div className="import-actions">
          <span className="meta">
            {text.trim() ? `${text.trim().split(/\s+/).length} words ready` : 'No source loaded'}
          </span>
          <button className="primary-button" type="submit" disabled={!text.trim() || loading}>
            {loading ? 'Athena is reading…' : 'Add to project graph'}
          </button>
        </div>
        {loading && <div className="indeterminate" aria-label="Import in progress"><span /></div>}
        {error && (
          <div className="import-error" role="alert">
            <strong>Nothing was changed.</strong>
            <span>{error}</span>
            {!mock && <span className="meta">Append <code>?mock=1</code> for the honest offline demo path.</span>}
          </div>
        )}
      </form>

      {receipt && <Receipt delta={receipt} onGraph={showGraph} />}
    </main>
  );
}
