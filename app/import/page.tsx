'use client';

import Link from 'next/link';
import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ingestFiles, ingestGitHubDataset, ingestText } from '@/lib/client-api';
import type { IngestResult } from '@/lib/types';
import styles from './import.module.css';

const DEMO_CORPUS_URL = 'https://github.com/EdwinjJ1/unsw-mistral-hackathon-2026/tree/main/demo-corpus';
const SUPPORTED = ['txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'epub'];

const EXAMPLES = {
  'Meeting notes': `Launch readiness — Friday\n\nEngineering says the auth service shipped on Thursday. Ops still needs confirmation before cutover.\nPriya owns the rollback runbook, due tomorrow, and needs Legal to confirm whether retention is 14 or 30 days.\nThe observability dashboard is still unowned.`,
  'PR description': `PR: Add retention window enforcement\n\nImplements the policy hook required by the rollback runbook. Waiting on Legal to confirm the final duration.\nOwner: Priya Shah. Target: before launch cutover.`,
  'Spec excerpt': `Rollback policy v2\n\nEvery production release must retain the previous deploy artefact. The retention duration is pending Legal approval.\nOperations cannot sign off the cutover checklist until the policy is published.`,
};

interface SelectedDocument { file: File; path: string }

const SCAN_STAGES = [
  ['Reading source material', 'Fetching and parsing every supported document.'],
  ['Mapping the organisation', 'Extracting departments, people and working relationships.'],
  ['Resolving delivery work', 'Assigning owners, dates, dependencies and questions.'],
  ['Drawing the constellation', 'Persisting the graph and preparing the Discord plan.'],
] as const;

function ResultCard({ result }: { result: IngestResult }) {
  const teams = result.upsertNodes?.filter((node) => node.type === 'Team') ?? [];
  const people = result.upsertNodes?.filter((node) => node.type === 'Person') ?? [];
  const tasks = result.upsertNodes?.filter((node) => node.type === 'Task') ?? [];
  const conflicts = result.upsertEdges?.filter((edge) => edge.type === 'CONFLICTS_WITH') ?? [];
  return (
    <section id="scan-result" className={styles.result} aria-live="polite">
      <div className={styles.resultHeading}>
        <p>SCAN COMPLETE / {result.analysisMode.toUpperCase()}</p>
        <span>{new Date(result.plan.generatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <h2>The constellation is ready.</h2>
      <p>{result.plan.summary}</p>
      <div className={styles.metrics}>
        <div><strong>{teams.length}</strong><span>DEPARTMENTS</span></div>
        <div><strong>{people.length}</strong><span>PEOPLE</span></div>
        <div><strong>{tasks.length}</strong><span>WORK ITEMS</span></div>
        <div><strong>{conflicts.length}</strong><span>CONFLICTS</span></div>
      </div>
      {teams.length > 0 && (
        <div className={styles.departmentList}>
          {teams.map((team, index) => <span key={team.id}>{String(index + 1).padStart(2, '0')} · {team.label}</span>)}
        </div>
      )}
      {result.plan.assignments.length > 0 && (
        <div className={styles.planPreview}>
          <span>GENERATED DELIVERY PLAN</span>
          {result.plan.assignments.map((assignment) => (
            <div key={assignment.taskId}>
              <strong>{assignment.title}</strong>
              <small>{assignment.owner} · {assignment.department} · {assignment.dueDate ?? 'date to confirm'}</small>
            </div>
          ))}
        </div>
      )}
      {result.plan.clarificationQuestions.length > 0 && (
        <div className={styles.questions}>
          <span>OWNERSHIP TO CLARIFY</span>
          {result.plan.clarificationQuestions.map((question) => <p key={question}>{question}</p>)}
        </div>
      )}
      <div className={styles.resultActions}>
        <Link href="/">Open constellation →</Link>
        <Link href="/plan">Review Discord handoff →</Link>
      </div>
    </section>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [datasetUrl, setDatasetUrl] = useState(DEMO_CORPUS_URL);
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('pasted-document.md');
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  useEffect(() => {
    if (!loading) {
      setScanStage(0);
      setElapsedSeconds(0);
      return;
    }
    const clock = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    const timers = [1400, 3200, 5200].map((delay, index) =>
      window.setTimeout(() => setScanStage(index + 1), delay));
    return () => {
      window.clearInterval(clock);
      timers.forEach(window.clearTimeout);
    };
  }, [loading]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => {
      document.getElementById('scan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [result]);

  const selectDocuments = async (files: File[]) => {
    const selected = files.flatMap((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED.includes(extension)) return [];
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return [{ file, path: relative || file.name }];
    });
    if (!selected.length) {
      setError('No supported documents found. Add text, PDF, Word, PowerPoint or Excel files.');
      return;
    }
    setDocuments(selected);
    setDatasetUrl('');
    setResult(null);
    setError(null);
    if (selected.length === 1 && /\.(txt|md|csv|json|ya?ml|xml|html)$/i.test(selected[0].file.name)) {
      setText(await selected[0].file.text());
      setSourceName(selected[0].path);
    } else {
      setText('');
      setSourceName(`dataset-${selected.length}-documents`);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = datasetUrl.trim()
        ? await ingestGitHubDataset(datasetUrl.trim())
        : documents.length
          ? await ingestFiles(documents)
          : await ingestText(text.trim());
      setResult(next);
      router.prefetch('/');
      router.prefetch('/plan');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Athena could not scan this dataset.');
    } finally {
      setLoading(false);
    }
  };

  const directoryInputProps = {
    type: 'file', multiple: true, hidden: true, webkitdirectory: '', directory: '',
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void selectDocuments(Array.from(event.target.files ?? [])),
  } as React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string; directory: string };

  const readyLabel = datasetUrl.trim()
    ? 'GITHUB CORPUS READY'
    : documents.length
      ? `${documents.length} DOCUMENT${documents.length === 1 ? '' : 'S'} READY`
      : text.trim()
        ? `${text.trim().split(/\s+/).length} WORDS READY`
        : 'AWAITING SOURCE';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span>A</span><strong>Athena</strong><small>ORGANISATION ATLAS</small>
        </Link>
        <nav><Link href="/">Constellation</Link><Link href="/plan">Delivery plan</Link></nav>
        <p><i /> DOCUMENT INTAKE</p>
      </header>

      <div className={styles.workspace}>
        <section className={styles.intro}>
          <p>02 / KNOWLEDGE INTAKE</p>
          <h1>Documents,<br /><em>into orbit.</em></h1>
          <span>Give Athena the raw material. Mistral identifies departments, people, ownership, work and contradictions—then draws the organisation that is actually there.</span>
          <ol>
            <li><span>01</span><div><strong>Read every source</strong><small>Markdown, PDF, Word, PowerPoint, Excel or an entire GitHub folder.</small></div></li>
            <li><span>02</span><div><strong>Resolve the work</strong><small>Preserve explicit owners; otherwise route work through the stated department.</small></div></li>
            <li><span>03</span><div><strong>Publish the graph</strong><small>The generated constellation and Discord handoff use the same persisted data.</small></div></li>
          </ol>
          <div className={styles.plate}>ATHENA / INTAKE PLATE No. 02</div>
        </section>

        <form
          className={`${styles.form} ${dragging ? styles.dragging : ''}`}
          onSubmit={submit}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event: DragEvent<HTMLFormElement>) => {
            event.preventDefault(); setDragging(false); void selectDocuments(Array.from(event.dataTransfer.files));
          }}
        >
          <div className={styles.formHead}>
            <div><p>SOURCE MATERIAL</p><h2>Begin a new scan</h2></div>
            <span>{readyLabel}</span>
          </div>

          <label className={styles.field}>
            <span>01 · GITHUB DATASET FOLDER</span>
            <input
              type="url"
              value={datasetUrl}
              onChange={(event) => { setDatasetUrl(event.target.value); setDocuments([]); setText(''); setResult(null); }}
              placeholder="https://github.com/owner/repo/tree/main/documents"
            />
            <small>The backend fetches and parses every supported document in this folder.</small>
          </label>

          <div className={styles.divider}><span>OR ADD MATERIAL DIRECTLY</span></div>
          <div className={styles.exampleRow}>
            {Object.entries(EXAMPLES).map(([label, example]) => (
              <button type="button" key={label} onClick={() => {
                setText(example); setSourceName(label === 'Meeting notes' ? 'meeting.md' : `${label.toLowerCase().replace(/\s+/g, '-')}.md`);
                setDatasetUrl(''); setDocuments([]); setResult(null); setError(null);
              }}>{label}</button>
            ))}
          </div>

          <div className={styles.textareaWrap}>
            <textarea
              value={text}
              onChange={(event) => { setText(event.target.value); setDatasetUrl(''); setDocuments([]); setResult(null); }}
              placeholder="Paste meeting notes, a PR description, a spec excerpt or an exported conversation…"
              aria-label="Source text to import"
            />
            {dragging && <div className={styles.dropOverlay}>DROP DOCUMENT SET</div>}
          </div>

          <div className={styles.uploadRow}>
            <button type="button" onClick={() => fileInput.current?.click()}>↑ Add documents</button>
            <button type="button" onClick={() => folderInput.current?.click()}>↑ Add folder</button>
            <span>{SUPPORTED.slice(0, 10).join(' · ').toUpperCase()}</span>
            <input ref={fileInput} type="file" accept={SUPPORTED.map((extension) => `.${extension}`).join(',')} multiple hidden onChange={(event) => void selectDocuments(Array.from(event.target.files ?? []))} />
            <input ref={folderInput} {...directoryInputProps} />
          </div>

          {error && <div className={styles.error} role="alert"><strong>SCAN INTERRUPTED</strong><span>{error}</span></div>}
          <div className={styles.submitRow}>
            <span>{loading ? 'MISTRAL IS READING THE CORPUS…' : 'READY TO GENERATE A NEW ORGANISATION GRAPH'}</span>
            <button type="submit" disabled={loading || (!datasetUrl.trim() && !documents.length && !text.trim())}>
              {loading ? 'Scanning…' : 'Generate constellation →'}
            </button>
          </div>
          {loading && <div className={styles.progress}><i /></div>}
          {loading && (
            <div className={styles.scanOverlay} role="status" aria-live="polite">
              <div className={styles.scanVisual} aria-hidden="true">
                <i className={styles.orbitOne}><b /></i>
                <i className={styles.orbitTwo}><b /></i>
                <span>A</span>
              </div>
              <div className={styles.scanCopy}>
                <p>MISTRAL ANALYSIS IN PROGRESS · {elapsedSeconds}s</p>
                <h2>{SCAN_STAGES[scanStage][0]}</h2>
                <span>{SCAN_STAGES[scanStage][1]}</span>
              </div>
              <ol className={styles.scanSteps}>
                {SCAN_STAGES.map(([title], index) => (
                  <li
                    key={title}
                    className={index < scanStage ? styles.stepDone : index === scanStage ? styles.stepActive : ''}
                  >
                    <i />
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{title}</strong>
                  </li>
                ))}
              </ol>
              <small>
                {elapsedSeconds < 30
                  ? 'Keep this page open. Athena will reveal the new graph when the scan is complete.'
                  : 'Still working — larger corpora take longer to fetch and analyse. This scan will time out cleanly after 2 minutes.'}
              </small>
            </div>
          )}
        </form>
      </div>
      {result && <ResultCard result={result} />}
    </main>
  );
}
