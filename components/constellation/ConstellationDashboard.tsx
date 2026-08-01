'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { fetchGraph, ingestFiles } from '@/lib/client-api';
import type { Graph, IngestResult, Status } from '@/lib/types';
import styles from './constellation.module.css';

type Health = 'On track' | 'Watch' | 'At risk';
type Person = { name: string; role: string; initials: string };
type WorkItem = {
  title: string;
  owner: string;
  progress: number;
  due: string;
  state: 'Active' | 'Review' | 'Blocked' | 'Done';
};
type UpdateEntry = {
  title: string;
  quote?: string;
  when: string;
  state: WorkItem['state'];
};
type ReminderPreset = '15' | '60' | '1440' | 'custom';
type ActionStatus = {
  busy?: 'push' | 'remind';
  message?: string;
  tone?: 'success' | 'error';
};
type ReminderSummary = {
  taskKey: string;
  remindAt: string;
  status: 'queued' | 'processing';
};
type Department = {
  id: string;
  name: string;
  code: string;
  image: string;
  x: number;
  y: number;
  size: number;
  health: Health;
  description: string;
  mission: string;
  people: Person[];
  subteams: string[];
  work: WorkItem[];
  updates?: UpdateEntry[];
};

type SelectedDocument = { file: File; path: string };

const SUPPORTED_DOCUMENTS = [
  'txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html',
  'pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'epub',
];
const MAX_UPLOAD_FILES = 50;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ART_DEPARTMENTS: Department[] = [
  {
    id: 'engineering', name: 'Engineering', code: 'ENG · 01',
    image: '/planets/cutouts/earth.webp', x: 17, y: 48, size: 212, health: 'Watch',
    description: 'Builds and protects the product foundation: platform, client applications, infrastructure and release systems.',
    mission: 'Make every product promise technically real, resilient and repeatable.',
    people: [
      { name: 'Priya Shah', role: 'VP Engineering', initials: 'PS' },
      { name: 'Marcus Lee', role: 'Platform Lead', initials: 'ML' },
      { name: 'Inez Park', role: 'Client Lead', initials: 'IP' },
      { name: 'Owen Hart', role: 'Infrastructure', initials: 'OH' },
    ],
    subteams: ['Platform', 'Client Apps', 'Infrastructure', 'Developer Experience'],
    work: [
      { title: 'Atlas API migration', owner: 'Marcus Lee', progress: 72, due: '08 Aug', state: 'Active' },
      { title: 'Release confidence programme', owner: 'Priya Shah', progress: 48, due: '12 Aug', state: 'Review' },
      { title: 'Identity service hardening', owner: 'Owen Hart', progress: 31, due: '16 Aug', state: 'Blocked' },
    ],
  },
  {
    id: 'product', name: 'Product', code: 'PRD · 02',
    image: '/planets/cutouts/jupiter.webp', x: 39, y: 20, size: 96, health: 'On track',
    description: 'Turns company strategy and customer evidence into a coherent roadmap, measurable bets and clear product decisions.',
    mission: 'Choose the smallest set of valuable problems that move the whole company forward.',
    people: [
      { name: 'Sofia Chen', role: 'VP Product', initials: 'SC' },
      { name: 'Theo Grant', role: 'Group PM', initials: 'TG' },
      { name: 'Maya Singh', role: 'Product Ops', initials: 'MS' },
      { name: 'Jon Bell', role: 'Product Manager', initials: 'JB' },
    ],
    subteams: ['Core Product', 'Growth Product', 'Product Operations', 'Insights'],
    work: [
      { title: 'Autumn roadmap', owner: 'Sofia Chen', progress: 84, due: '05 Aug', state: 'Review' },
      { title: 'Workspace activation', owner: 'Theo Grant', progress: 63, due: '14 Aug', state: 'Active' },
      { title: 'Customer evidence library', owner: 'Maya Singh', progress: 40, due: '20 Aug', state: 'Active' },
    ],
  },
  {
    id: 'design', name: 'Design', code: 'DSN · 03',
    image: '/planets/cutouts/saturn.webp', x: 61, y: 29, size: 112, health: 'On track',
    description: 'Shapes how Athena feels and works across product, brand and research, maintaining a single expressive design language.',
    mission: 'Turn complexity into calm, useful and memorable experiences.',
    people: [
      { name: 'Noah Williams', role: 'Design Director', initials: 'NW' },
      { name: 'Ari Costa', role: 'Product Design', initials: 'AC' },
      { name: 'Liv Morgan', role: 'Brand Design', initials: 'LM' },
      { name: 'Emi Tan', role: 'Design Systems', initials: 'ET' },
    ],
    subteams: ['Product Design', 'Brand Studio', 'Design Systems', 'Research'],
    work: [
      { title: 'Constellation navigation', owner: 'Ari Costa', progress: 78, due: '07 Aug', state: 'Review' },
      { title: 'Athena visual system', owner: 'Liv Morgan', progress: 57, due: '18 Aug', state: 'Active' },
      { title: 'Accessibility audit', owner: 'Emi Tan', progress: 45, due: '21 Aug', state: 'Active' },
    ],
  },
  {
    id: 'research', name: 'Research', code: 'RSH · 04',
    image: '/planets/cutouts/neptune.webp', x: 82, y: 18, size: 82, health: 'On track',
    description: 'Explores emerging capabilities, evaluates model behaviour and creates the evidence that informs future product bets.',
    mission: 'Reduce uncertainty before it becomes expensive.',
    people: [
      { name: 'Dr. Lena Ortiz', role: 'Research Lead', initials: 'LO' },
      { name: 'Samir Rao', role: 'Applied Scientist', initials: 'SR' },
      { name: 'Kate Wu', role: 'Research Engineer', initials: 'KW' },
      { name: 'Ben Ito', role: 'Evaluation Lead', initials: 'BI' },
    ],
    subteams: ['Applied AI', 'Evaluations', 'Prototyping', 'Research Ops'],
    work: [
      { title: 'Long-context evaluation', owner: 'Ben Ito', progress: 66, due: '11 Aug', state: 'Active' },
      { title: 'Agent memory prototype', owner: 'Kate Wu', progress: 35, due: '23 Aug', state: 'Active' },
      { title: 'Model risk review', owner: 'Dr. Lena Ortiz', progress: 90, due: '04 Aug', state: 'Review' },
    ],
  },
  {
    id: 'operations', name: 'Operations', code: 'OPS · 05',
    image: '/planets/cutouts/mars.webp', x: 41, y: 54, size: 86, health: 'At risk',
    description: 'Connects plans to dependable execution through programmes, business systems, launch readiness and operating cadence.',
    mission: 'Make the company easier to run every week.',
    people: [
      { name: 'Amara Okafor', role: 'COO', initials: 'AO' },
      { name: 'Ruth Kim', role: 'Programme Lead', initials: 'RK' },
      { name: 'Dan Silva', role: 'Business Systems', initials: 'DS' },
      { name: 'Zoe Price', role: 'Launch Operations', initials: 'ZP' },
    ],
    subteams: ['Programme Office', 'Business Systems', 'Launch Ops', 'Workplace'],
    work: [
      { title: 'Q3 operating review', owner: 'Amara Okafor', progress: 52, due: '06 Aug', state: 'Review' },
      { title: 'CRM consolidation', owner: 'Dan Silva', progress: 28, due: '30 Aug', state: 'Blocked' },
      { title: 'Launch readiness v2', owner: 'Zoe Price', progress: 69, due: '10 Aug', state: 'Active' },
    ],
  },
  {
    id: 'people', name: 'People', code: 'PPL · 06',
    image: '/planets/cutouts/venus.webp', x: 65, y: 53, size: 84, health: 'On track',
    description: 'Designs the systems that help people join, grow, collaborate and do the best work of their careers.',
    mission: 'Create an environment where talented people can compound.',
    people: [
      { name: 'Elena Voss', role: 'Chief People Officer', initials: 'EV' },
      { name: 'Tara Brooks', role: 'Talent Lead', initials: 'TB' },
      { name: 'Felix Wong', role: 'People Partner', initials: 'FW' },
      { name: 'Nia James', role: 'Learning Lead', initials: 'NJ' },
    ],
    subteams: ['Talent', 'People Partners', 'Learning', 'Culture & Experience'],
    work: [
      { title: 'Leadership foundations', owner: 'Nia James', progress: 74, due: '09 Aug', state: 'Active' },
      { title: 'Hiring plan refresh', owner: 'Tara Brooks', progress: 58, due: '13 Aug', state: 'Review' },
      { title: 'Career framework', owner: 'Felix Wong', progress: 42, due: '27 Aug', state: 'Active' },
    ],
  },
  {
    id: 'growth', name: 'Growth', code: 'GRO · 07',
    image: '/planets/cutouts/sun.webp', x: 28, y: 76, size: 76, health: 'Watch',
    description: 'Creates demand and durable customer relationships across brand, lifecycle, community and strategic partnerships.',
    mission: 'Help the right people discover, understand and keep choosing Athena.',
    people: [
      { name: 'Milo Reed', role: 'VP Growth', initials: 'MR' },
      { name: 'Aya Foster', role: 'Lifecycle', initials: 'AF' },
      { name: 'Pia Novak', role: 'Brand', initials: 'PN' },
      { name: 'Hugo Lin', role: 'Partnerships', initials: 'HL' },
    ],
    subteams: ['Brand', 'Lifecycle', 'Community', 'Partnerships'],
    work: [
      { title: 'Project Atlas launch', owner: 'Pia Novak', progress: 61, due: '15 Aug', state: 'Active' },
      { title: 'Activation experiments', owner: 'Aya Foster', progress: 47, due: '19 Aug', state: 'Active' },
      { title: 'Partner narrative', owner: 'Hugo Lin', progress: 82, due: '08 Aug', state: 'Review' },
    ],
  },
  {
    id: 'finance', name: 'Finance', code: 'FIN · 08',
    image: '/planets/cutouts/mercury.webp', x: 49, y: 77, size: 72, health: 'On track',
    description: 'Gives teams the financial clarity to invest wisely through planning, analysis, procurement and reporting.',
    mission: 'Put timely, trustworthy economics behind every important decision.',
    people: [
      { name: 'Grace Bell', role: 'Finance Director', initials: 'GB' },
      { name: 'Leo Martin', role: 'FP&A', initials: 'LM' },
      { name: 'Sara Nordin', role: 'Controller', initials: 'SN' },
      { name: 'Will Jones', role: 'Procurement', initials: 'WJ' },
    ],
    subteams: ['FP&A', 'Accounting', 'Procurement', 'Strategic Finance'],
    work: [
      { title: 'FY27 planning model', owner: 'Leo Martin', progress: 38, due: '29 Aug', state: 'Active' },
      { title: 'Vendor rationalisation', owner: 'Will Jones', progress: 70, due: '12 Aug', state: 'Review' },
      { title: 'Unit economics refresh', owner: 'Grace Bell', progress: 55, due: '17 Aug', state: 'Active' },
    ],
  },
  {
    id: 'legal', name: 'Legal', code: 'LGL · 09',
    image: '/planets/cutouts/moon.webp', x: 70, y: 75, size: 68, health: 'Watch',
    description: 'Protects the company and enables responsible speed across product counsel, privacy, commercial work and governance.',
    mission: 'Make the safest path the clearest path.',
    people: [
      { name: 'Mina Patel', role: 'General Counsel', initials: 'MP' },
      { name: 'Oscar Dean', role: 'Privacy Counsel', initials: 'OD' },
      { name: 'Yuki Abe', role: 'Commercial Counsel', initials: 'YA' },
      { name: 'Iris Cole', role: 'Legal Operations', initials: 'IC' },
    ],
    subteams: ['Product Counsel', 'Privacy', 'Commercial', 'Legal Operations'],
    work: [
      { title: 'Data retention policy', owner: 'Oscar Dean', progress: 46, due: '07 Aug', state: 'Blocked' },
      { title: 'Enterprise terms', owner: 'Yuki Abe', progress: 76, due: '09 Aug', state: 'Review' },
      { title: 'AI governance register', owner: 'Mina Patel', progress: 59, due: '22 Aug', state: 'Active' },
    ],
  },
  {
    id: 'strategy', name: 'Strategy', code: 'STG · 10',
    image: '/planets/cutouts/strategic.webp', x: 84, y: 41, size: 86, health: 'On track',
    description: 'Holds the long view, joins signals across the company and turns ambiguity into a few consequential choices.',
    mission: 'Keep every team moving toward the same future.',
    people: [
      { name: 'Alex Morgan', role: 'Chief of Staff', initials: 'AM' },
      { name: 'June Park', role: 'Strategy Lead', initials: 'JP' },
      { name: 'Cal Morris', role: 'Market Intelligence', initials: 'CM' },
      { name: 'Rae Ellis', role: 'Executive Operations', initials: 'RE' },
    ],
    subteams: ['Corporate Strategy', 'Market Intelligence', 'Executive Ops', 'Special Projects'],
    work: [
      { title: 'Three-year narrative', owner: 'June Park', progress: 68, due: '16 Aug', state: 'Active' },
      { title: 'Category landscape', owner: 'Cal Morris', progress: 81, due: '06 Aug', state: 'Review' },
      { title: 'Board strategy session', owner: 'Alex Morgan', progress: 44, due: '25 Aug', state: 'Active' },
    ],
  },
];

const SATELLITE_OFFSETS = [
  { x: -8, y: -10 }, { x: 9, y: -8 }, { x: -10, y: 10 }, { x: 10, y: 10 },
];
const FOCUSED_SATELLITE_OFFSETS = [
  { x: -17, y: -16 }, { x: 17, y: -14 }, { x: -18, y: 16 }, { x: 18, y: 15 },
];
const HEALTH_CLASS: Record<Health, string> = {
  'On track': styles.healthGood, Watch: styles.healthWatch, 'At risk': styles.healthRisk,
};

function localDateTimeValue(timestamp: number): string {
  const date = new Date(timestamp);
  const localTimestamp = timestamp - date.getTimezoneOffset() * 60_000;
  return new Date(localTimestamp).toISOString().slice(0, 16);
}

function statusToWork(status?: Status): WorkItem['state'] {
  if (status === 'done') return 'Done';
  if (status === 'blocked') return 'Blocked';
  if (status === 'at_risk') return 'Review';
  return 'Active';
}

function statusToProgress(status?: Status) {
  if (status === 'done') return 100;
  if (status === 'in_progress') return 64;
  if (status === 'at_risk') return 45;
  if (status === 'blocked') return 24;
  return 8;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function populationPosition(
  department: Department,
  index: number,
  total: number,
): CSSProperties {
  let ring = 0;
  let firstIndex = 0;
  let capacity = 12;
  while (index >= firstIndex + capacity) {
    firstIndex += capacity;
    ring += 1;
    capacity += 4;
  }
  const countOnRing = Math.min(capacity, total - firstIndex);
  const slot = index - firstIndex;
  const angle = (-Math.PI / 2) + ((slot / countOnRing) * Math.PI * 2) + (ring * 0.17);
  const radius = (department.size / 2) + 14 + (ring * 14);
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return {
    left: `calc(${department.x}% + ${x.toFixed(1)}px)`,
    top: `calc(${department.y}% + ${y.toFixed(1)}px)`,
    '--person-delay': `${(index % 12) * 18}ms`,
  } as CSSProperties;
}

function teamOfNode(graph: Graph, nodeId: string) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  return node?.type === 'Team' ? node.id : node?.teamId;
}

function deriveDepartments(graph: Graph): { departments: Department[]; links: [string, string][] } {
  const teams = graph.nodes.filter((node) => node.type === 'Team');
  const departments = teams.map((team, index): Department => {
    const art = ART_DEPARTMENTS[index % ART_DEPARTMENTS.length];
    const people = graph.nodes.filter((node) => node.type === 'Person' && node.teamId === team.id);
    const tasks = graph.nodes.filter((node) => node.type === 'Task' && node.teamId === team.id);
    const connectedIds = new Set<string>();
    for (const edge of graph.edges) {
      const fromTeam = teamOfNode(graph, edge.from);
      const toTeam = teamOfNode(graph, edge.to);
      if (fromTeam === team.id && toTeam && toTeam !== team.id) connectedIds.add(toTeam);
      if (toTeam === team.id && fromTeam && fromTeam !== team.id) connectedIds.add(fromTeam);
    }
    const blocked = tasks.some((task) => task.status === 'blocked');
    const risky = tasks.some((task) => task.status === 'at_risk' || (!task.ownerId && task.status !== 'done'));
    return {
      id: team.id,
      name: team.label,
      code: `${team.id.replace(/^team\./, '').slice(0, 3).toUpperCase()} · ${String(index + 1).padStart(2, '0')}`,
      image: art.image,
      x: art.x,
      y: art.y,
      size: index === 0 ? Math.max(150, art.size) : art.size,
      health: blocked ? 'At risk' : risky ? 'Watch' : 'On track',
      description: team.summary ?? `${team.label} work identified from the imported organisation corpus.`,
      mission: team.sourceRef?.quote ?? team.summary ?? `Keep ${team.label} work visible, owned and current.`,
      people: people.map((person) => {
        const open = tasks.filter((task) => task.ownerId === person.id && task.status !== 'done').length;
        return {
          name: person.label,
          role: open ? `${open} open work item${open === 1 ? '' : 's'}` : 'Team member',
          initials: person.label.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        };
      }),
      subteams: [...connectedIds]
        .map((id) => graph.nodes.find((node) => node.id === id)?.label)
        .filter((label): label is string => Boolean(label)),
      work: tasks.map((task) => ({
        title: task.label,
        owner: graph.nodes.find((node) => node.id === task.ownerId)?.label ?? 'Needs confirmation',
        progress: statusToProgress(task.status),
        due: task.dueDate
          ? new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
          : 'Unscheduled',
        state: statusToWork(task.status),
      })),
      updates: graph.nodes
        .filter(
          (node) =>
            (node.type === 'Task' || node.type === 'Blocker')
            && node.teamId === team.id
            && node.sourceRef?.kind === 'discord_dm',
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4)
        .map((node) => ({
          title: node.label,
          quote: node.sourceRef?.quote,
          when: node.updatedAt,
          state: statusToWork(node.status),
        })),
    };
  });
  const known = new Set(departments.map((department) => department.id));
  const links = graph.edges.flatMap((edge): [string, string][] => {
    const from = teamOfNode(graph, edge.from);
    const to = teamOfNode(graph, edge.to);
    return from && to && from !== to && known.has(from) && known.has(to) ? [[from, to]] : [];
  });
  return {
    departments,
    links: [...new Map(links.map((link) => [link.slice().sort().join('--'), link])).values()],
  };
}

function AtlasHeader({
  teams, bodies, live, onAddMaterials,
}: {
  teams: number;
  bodies: number;
  live: boolean;
  onAddMaterials: () => void;
}) {
  return (
    <header className={styles.atlasHeader}>
      <div className={styles.brandLockup}>
        <span className={styles.brandMark}>A</span>
        <span><strong>Athena</strong><small>ORGANISATION ATLAS</small></span>
      </div>
      <button
        type="button"
        className={styles.addSourceButton}
        onClick={onAddMaterials}
        aria-label="Add documents to this constellation"
        title="Add new material"
      >
        <span aria-hidden="true">+</span>
        <small>ADD MATERIAL</small>
      </button>
      <nav className={styles.atlasNav} aria-label="Athena actions">
        <Link href="/import">Analyse documents</Link>
        <Link href="/plan">Delivery plan</Link>
      </nav>
      <div className={styles.headerMeta}>
        <span><i className={live ? styles.liveDot : styles.offlineDot} /> {live ? 'LIVE CONSTELLATION' : 'CONNECTING'}</span>
        <span>{teams} TEAMS · {bodies} ORBITAL BODIES</span>
        <span>{new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      </div>
    </header>
  );
}

function IncrementalIngestModal({
  existingGraph,
  onClose,
  onApplied,
}: {
  existingGraph: Graph;
  onClose: () => void;
  onApplied: (nextGraph: Graph, newTeamId?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [newCounts, setNewCounts] = useState({ teams: 0, people: 0, tasks: 0 });

  const selectFiles = (files: File[]) => {
    const supported: SelectedDocument[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (SUPPORTED_DOCUMENTS.includes(extension)) supported.push({ file, path: file.name });
      else skipped.push(file.name);
    }
    if (!supported.length) {
      setError('No supported documents found. Add text, PDF, Word, PowerPoint or Excel files.');
      return;
    }
    if (supported.length > MAX_UPLOAD_FILES) {
      setError(`A scan can contain at most ${MAX_UPLOAD_FILES} documents.`);
      return;
    }
    const total = supported.reduce((sum, item) => sum + item.file.size, 0);
    if (total > MAX_UPLOAD_BYTES) {
      setError(`This material is ${formatBytes(total)}. The maximum upload is 30 MB.`);
      return;
    }
    setDocuments(supported);
    setResult(null);
    setError(skipped.length
      ? `${skipped.length} unsupported file${skipped.length === 1 ? ' was' : 's were'} skipped: ${skipped.slice(0, 3).join(', ')}`
      : null);
  };

  const acceptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  };

  const runScan = async () => {
    if (!documents.length || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const before = new Set(existingGraph.nodes.map((node) => node.id));
      const scan = await ingestFiles(documents, { replace: false });
      const nextGraph = await fetchGraph();
      const added = nextGraph.nodes.filter((node) => !before.has(node.id));
      const addedTeams = added.filter((node) => node.type === 'Team');
      setNewCounts({
        teams: addedTeams.length,
        people: added.filter((node) => node.type === 'Person').length,
        tasks: added.filter((node) => node.type === 'Task').length,
      });
      setResult(scan);
      onApplied(nextGraph, addedTeams[0]?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Athena could not analyse these documents.');
    } finally {
      setLoading(false);
    }
  };

  const totalBytes = documents.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <div className={styles.ingestBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section className={styles.ingestModal} role="dialog" aria-modal="true" aria-labelledby="incremental-ingest-title">
        <header className={styles.ingestHeader}>
          <div>
            <p>ADD TO CONSTELLATION</p>
            <h2 id="incremental-ingest-title">Bring new work into orbit.</h2>
          </div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Close document intake">×</button>
        </header>

        {!result ? (
          <>
            <p className={styles.ingestIntro}>
              Athena will detect new departments, people, tasks, owners and dependencies, then merge them into the existing persisted graph.
            </p>
            <div
              className={`${styles.ingestDropzone} ${dragging ? styles.ingestDropzoneActive : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={acceptDrop}
            >
              <span className={styles.ingestDropMark}>+</span>
              <strong>{dragging ? 'Release to add documents' : 'Drag new material here'}</strong>
              <small>PDF · DOCX · PPTX · XLSX · MD · TXT · CSV · JSON · up to 30 MB</small>
              <button type="button" onClick={() => inputRef.current?.click()}>Choose documents</button>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept={SUPPORTED_DOCUMENTS.map((extension) => `.${extension}`).join(',')}
                onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
              />
            </div>

            {documents.length > 0 && (
              <div className={styles.ingestManifest}>
                <div><strong>{documents.length} document{documents.length === 1 ? '' : 's'} ready</strong><span>{formatBytes(totalBytes)}</span></div>
                <ul>
                  {documents.map(({ file, path }) => (
                    <li key={`${path}-${file.size}`}><span>{path}</span><small>{formatBytes(file.size)}</small></li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className={styles.ingestError} role="alert">{error}</p>}
            <footer className={styles.ingestFooter}>
              <span><i /> SQLITE · INCREMENTAL MERGE</span>
              <button type="button" onClick={() => void runScan()} disabled={!documents.length || loading}>
                {loading ? 'ATHENA IS ANALYSING…' : 'ANALYSE & ADD TO MAP →'}
              </button>
            </footer>
            {loading && <div className={styles.ingestProgress}><i /></div>}
          </>
        ) : (
          <div className={styles.ingestSuccess} aria-live="polite">
            <span>✓</span>
            <p>SCAN COMPLETE / {result.analysisMode.toUpperCase()}</p>
            <h3>The constellation has been updated.</h3>
            <div>
              <strong>{newCounts.teams}<small>NEW DEPARTMENTS</small></strong>
              <strong>{newCounts.people}<small>NEW PEOPLE</small></strong>
              <strong>{newCounts.tasks}<small>NEW TASKS</small></strong>
            </div>
            <p>{newCounts.teams
              ? 'The first new department is selected behind this window.'
              : 'No new department was found; matching people, work and relationships were merged into existing records.'}</p>
            <button type="button" onClick={onClose}>VIEW UPDATED CONSTELLATION →</button>
          </div>
        )}
      </section>
    </div>
  );
}

function MapLegend({ isFocused }: { isFocused: boolean }) {
  return (
    <div className={styles.legend}>
      <span className={styles.legendPlanet} /><span>{isFocused ? 'Department core' : 'Department'}</span>
      <span className={styles.legendMoon} /><span>{isFocused ? 'People / sub-team' : 'Hover for orbit'}</span>
      <span className={styles.legendLine} /><span>{isFocused ? 'Focused orbit' : 'Collaboration'}</span>
    </div>
  );
}

function ConstellationMap({
  departments, links, selected, hoveredId, isFocused, onHoverStart, onHoverEnd, onSelect, onSatellite, onReset,
}: {
  departments: Department[];
  links: [string, string][];
  selected: Department;
  hoveredId: string | null;
  isFocused: boolean;
  onHoverStart: (departmentId: string) => void;
  onHoverEnd: () => void;
  onSelect: (department: Department) => void;
  onSatellite: (department: Department, label: string) => void;
  onReset: () => void;
}) {
  const byId = useMemo(() => new Map(departments.map((item) => [item.id, item])), [departments]);
  const orbitingId = isFocused ? selected.id : hoveredId;
  const highlightedId = isFocused ? selected.id : hoveredId ?? selected.id;
  const satelliteOffsets = isFocused ? FOCUSED_SATELLITE_OFFSETS : SATELLITE_OFFSETS;
  const focusPlanetScale = Math.min(2.25, Math.max(1.18, 210 / selected.size));

  const panelRef = useRef<HTMLElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const viewMoved = view.x !== 0 || view.y !== 0 || view.scale !== 1;

  const clampView = (next: { x: number; y: number; scale: number }) => {
    const panel = panelRef.current;
    const limitX = (panel?.clientWidth ?? 1200) * 0.75 * next.scale;
    const limitY = (panel?.clientHeight ?? 900) * 0.75 * next.scale;
    return {
      scale: next.scale,
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    };
  };
  const clampViewRef = useRef(clampView);
  clampViewRef.current = clampView;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = panel.getBoundingClientRect();
        const pointerX = event.clientX - (rect.left + rect.width / 2);
        const pointerY = event.clientY - (rect.top + rect.height / 2);
        const nextScale = Math.min(2.6, Math.max(0.55, current.scale * Math.exp(-event.deltaY * 0.0022)));
        const ratio = nextScale / current.scale;
        setView(clampViewRef.current({
          scale: nextScale,
          x: pointerX - ratio * (pointerX - current.x),
          y: pointerY - ratio * (pointerY - current.y),
        }));
      } else {
        setView(clampViewRef.current({
          scale: current.scale,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    setView({ x: 0, y: 0, scale: 1 });
  }, [isFocused]);

  const beginPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
      moved: false,
    };
  };

  const movePan = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      setIsPanning(true);
      panelRef.current?.setPointerCapture?.(event.pointerId);
    }
    setView(clampView({ scale: viewRef.current.scale, x: drag.originX + dx, y: drag.originY + dy }));
  };

  const endPan = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setIsPanning(false);
    if (panelRef.current?.hasPointerCapture?.(event.pointerId)) {
      panelRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={panelRef}
      className={[
        styles.mapPanel,
        isFocused ? styles.mapPanelFocused : '',
        isPanning ? styles.mapPanelPanning : '',
      ].join(' ')}
      aria-label="Interactive organisation constellation"
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className={styles.mapIntro}>
        <p>{isFocused ? `${selected.code} / FOCUSED SUB-SYSTEM` : '01 / LIVING ORGANISATION'}</p>
        <h1>{isFocused ? selected.name : 'One company'},<br /><em>in orbit.</em></h1>
        <span>{isFocused ? '04 satellites · Esc to return' : 'Hover to reveal · Select to magnify'}</span>
      </div>
      {isFocused && (
        <button type="button" className={styles.resetView} onClick={onReset}>
          <span>←</span> ALL DEPARTMENTS
        </button>
      )}
      {viewMoved && (
        <button
          type="button"
          className={styles.recenterView}
          onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          aria-label="Recenter the constellation map"
        >
          <span>⌖</span> RECENTER
        </button>
      )}
      <div
        className={styles.chartPan}
        style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
      >
      <div
        className={`${styles.chart} ${isFocused ? styles.chartFocused : ''}`}
        style={{
          '--focus-x': `${52 - selected.x}%`,
          '--focus-y': `${54 - selected.y}%`,
          '--focus-origin-x': `${selected.x}%`,
          '--focus-origin-y': `${selected.y}%`,
        } as CSSProperties}
      >
        <svg className={`${styles.network} ${isFocused ? styles.networkFocused : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {links.map(([fromId, toId], index) => {
            const from = byId.get(fromId);
            const to = byId.get(toId);
            if (!from || !to) return null;
            const isActive = highlightedId === fromId || highlightedId === toId;
            return (
              <path
                key={`${fromId}-${toId}`}
                d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + (index % 2 ? 4 : -4)} ${to.x} ${to.y}`}
                className={isActive ? styles.networkActive : styles.networkLine}
              />
            );
          })}
          {isFocused && (
            <>
              <ellipse
                cx={selected.x}
                cy={selected.y}
                rx="18"
                ry="16"
                className={styles.systemOrbit}
              />
              <ellipse
                cx={selected.x}
                cy={selected.y}
                rx="13"
                ry="11.5"
                className={styles.systemOrbitInner}
              />
            </>
          )}
          {orbitingId && satelliteOffsets.map((offset, index) => {
            const department = byId.get(orbitingId);
            if (!department) return null;
            return (
              <path
                key={`${orbitingId}-${isFocused ? 'focus' : 'preview'}-orbit-${index}`}
                d={`M ${department.x} ${department.y} Q ${department.x + offset.x * 0.52 + (index % 2 ? 1.4 : -1.4)} ${department.y + offset.y * 0.38} ${department.x + offset.x} ${department.y + offset.y}`}
                className={styles.orbitLine}
              />
            );
          })}
        </svg>
        {departments.map((department, departmentIndex) => {
          const isSelected = department.id === selected.id;
          const isOrbiting = department.id === orbitingId;
          const focusDistance = Math.hypot(department.x - selected.x, department.y - selected.y);
          const departmentSatelliteOffsets = isSelected && isFocused
            ? FOCUSED_SATELLITE_OFFSETS
            : SATELLITE_OFFSETS;
          const orbitDetails = [
            ...department.people.slice(0, 2).map((person) => ({ label: person.name, meta: person.role, size: 16 })),
            ...department.subteams.slice(0, 2).map((label) => ({ label, meta: 'Connected team', size: 21 })),
            ...department.work.slice(0, 4).map((work) => ({ label: work.title, meta: 'Work item', size: 18 })),
          ].slice(0, 4);
          return (
            <div key={department.id}>
              {department.people.map((person, personIndex) => (
                <button
                  type="button"
                  key={`${department.id}-${person.name}`}
                  className={[
                    styles.populationPerson,
                    isSelected ? styles.populationPersonSelected : '',
                    hoveredId && !isOrbiting ? styles.populationPersonMuted : '',
                  ].join(' ')}
                  style={populationPosition(department, personIndex, department.people.length)}
                  data-person={person.name}
                  onClick={() => onSatellite(department, person.name)}
                  aria-label={`Open ${person.name} in ${department.name}`}
                  title={`${person.name} · ${department.name}`}
                >
                  <span>{person.initials}</span>
                </button>
              ))}
              <button
                type="button"
                className={[
                  styles.planetButton,
                  isSelected ? styles.planetSelected : '',
                  isSelected && isFocused ? styles.planetInFocus : '',
                  isFocused && !isSelected ? styles.planetOutOfFocus : '',
                  hoveredId && !isOrbiting ? styles.planetMuted : '',
                ].join(' ')}
                style={{
                  left: `${department.x}%`, top: `${department.y}%`,
                  width: department.size, height: department.size, zIndex: isOrbiting ? 9 : isSelected ? 8 : 4,
                  '--float-delay': `${departmentIndex * -0.7}s`,
                  '--exit-delay': `${Math.max(0, 120 - Math.min(120, focusDistance * 2))}ms`,
                  '--focus-planet-scale': isSelected ? focusPlanetScale : 1,
                } as CSSProperties}
                onClick={() => onSelect(department)}
                onMouseEnter={() => onHoverStart(department.id)}
                onMouseLeave={onHoverEnd}
                onFocus={() => onHoverStart(department.id)}
                onBlur={onHoverEnd}
                tabIndex={isFocused && !isSelected ? -1 : 0}
                aria-hidden={isFocused && !isSelected}
                aria-label={isSelected && isFocused ? `Exit ${department.name} focus` : `Focus ${department.name} department`}
                aria-pressed={isSelected && isFocused}
              >
                <span className={styles.planetVisual}>
                  <span className={styles.planetHalo} />
                  <Image className={styles.planetImage} src={department.image} alt="" fill sizes="(max-width: 900px) 130px, 224px" priority={departmentIndex === 0} />
                </span>
                <span className={styles.planetCaption}><strong>{department.name}</strong><small>{department.code}</small></span>
              </button>
              {(isOrbiting || isSelected) && departmentSatelliteOffsets.slice(0, orbitDetails.length).map((offset, index) => {
                const detail = orbitDetails[index];
                const satelliteX = department.x + offset.x;
                const satelliteY = department.y + offset.y;
                const anchorX = isFocused
                  ? offset.x > 0 ? '0%' : '-100%'
                  : satelliteX >= 82 ? '-100%' : satelliteX <= 18 ? '0%' : '-50%';
                const anchorY = isFocused
                  ? offset.y > 0 ? '0%' : '-100%'
                  : satelliteY >= 84 ? '-100%' : satelliteY <= 15 ? '0%' : '-50%';
                return (
                  <div
                    key={`${department.id}-${detail.label}`}
                    className={`${styles.satelliteNode} ${isOrbiting ? styles.satelliteNodeActive : ''}`}
                    style={{
                      '--satellite-x': `${satelliteX - 50}%`,
                      '--satellite-y': `${satelliteY - 50}%`,
                    } as CSSProperties}
                  >
                    <button
                      type="button"
                      className={[
                        styles.satellite,
                        isOrbiting ? styles.satelliteVisible : '',
                        isSelected && isFocused ? styles.satelliteInFocus : '',
                      ].join(' ')}
                      style={{
                        '--satellite-delay': `${index * 42}ms`,
                        '--satellite-tx': anchorX,
                        '--satellite-ty': anchorY,
                      } as CSSProperties}
                      onMouseEnter={() => onHoverStart(department.id)}
                      onMouseLeave={onHoverEnd}
                      onFocus={() => onHoverStart(department.id)}
                      onBlur={onHoverEnd}
                      onClick={() => onSatellite(department, detail.label)}
                      tabIndex={isOrbiting ? 0 : -1}
                      aria-hidden={!isOrbiting}
                      aria-label={`Open ${detail.label} in ${department.name}`}
                    >
                      <Image src="/planets/cutouts/moon.webp" width={detail.size} height={detail.size} alt="" />
                      <span><strong>{detail.label}</strong><small>{detail.meta}</small></span>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
      <MapLegend isFocused={isFocused} />
      <div className={styles.mapIndex}>ATHENA / PLATE No. 07</div>
    </section>
  );
}

function FollowUpButton({ department }: { department: Department }) {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    setPhase('idle');
    setDetail('');
  }, [department.id]);

  const trigger = async () => {
    setPhase('sending');
    try {
      const response = await fetch('/api/plan/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: department.id }),
      });
      const body = await response.json() as {
        error?: string;
        owners?: Array<{ owner: string }>;
      };
      if (!response.ok) throw new Error(body.error ?? `Follow-up failed (${response.status})`);
      setDetail([...new Set((body.owners ?? []).map((item) => item.owner))].join(', '));
      setPhase('sent');
    } catch (error) {
      setDetail(error instanceof Error ? error.message : 'Follow-up failed');
      setPhase('error');
    }
  };

  return (
    <div className={styles.followup}>
      <button
        type="button"
        className={styles.followupButton}
        onClick={trigger}
        disabled={phase === 'sending' || phase === 'sent'}
      >
        {phase === 'sending' ? 'CONTACTING ATHENA…' : phase === 'sent' ? '✓ FOLLOW-UP DISPATCHED' : '跟进 · FOLLOW UP ON DISCORD'}
      </button>
      {phase === 'sent' && (
        <small className={styles.followupNote}>
          Athena is DMing {detail || 'the assignment owners'} on Discord now.
        </small>
      )}
      {phase === 'error' && <small className={styles.followupError}>{detail}</small>}
    </div>
  );
}

function Dashboard({
  department, focused, collapsed, onToggle,
}: {
  department: Department;
  focused: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const activeWork = department.work.filter((item) => item.state === 'Active').length;
  const averageProgress = department.work.length
    ? Math.round(department.work.reduce((sum, item) => sum + item.progress, 0) / department.work.length)
    : 0;
  const [presetByTask, setPresetByTask] = useState<Record<string, ReminderPreset>>({});
  const [customTimeByTask, setCustomTimeByTask] = useState<Record<string, string>>({});
  const [actionByTask, setActionByTask] = useState<Record<string, ActionStatus>>({});
  const [reminderByTask, setReminderByTask] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  const taskKey = (index: number) => `${department.id}:${index}`;
  const taskPayload = (work: WorkItem, index: number) => ({
    taskKey: taskKey(index),
    title: work.title,
    owner: work.owner,
    team: department.name,
    due: work.due,
    progress: work.progress,
    state: work.state,
  });

  useEffect(() => {
    let active = true;
    void fetch('/api/reminders')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load reminders');
        return response.json() as Promise<{ reminders: ReminderSummary[] }>;
      })
      .then(({ reminders }) => {
        if (!active) return;
        const next: Record<string, string> = {};
        for (const reminder of reminders) {
          if (
            reminder.taskKey.startsWith(`${department.id}:`)
            && (!next[reminder.taskKey] || reminder.remindAt < next[reminder.taskKey])
          ) {
            next[reminder.taskKey] = reminder.remindAt;
          }
        }
        setReminderByTask(next);
      })
      .catch(() => {
        // The task controls remain usable even if restoring a prior countdown fails.
      });
    return () => {
      active = false;
    };
  }, [department.id]);

  useEffect(() => {
    if (Object.keys(reminderByTask).length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [reminderByTask]);

  const responseError = async (response: Response): Promise<string> => {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    return payload.error || `Request failed (${response.status})`;
  };

  const pushTask = async (work: WorkItem, index: number) => {
    const key = taskKey(index);
    setActionByTask((current) => ({ ...current, [key]: { busy: 'push' } }));
    try {
      const response = await fetch('/api/discord/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(taskPayload(work, index)),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setActionByTask((current) => ({
        ...current,
        [key]: { message: 'Pushed to Discord', tone: 'success' },
      }));
    } catch (error) {
      setActionByTask((current) => ({
        ...current,
        [key]: {
          message: error instanceof Error ? error.message : 'Push failed',
          tone: 'error',
        },
      }));
    }
  };

  const scheduleReminder = async (work: WorkItem, index: number) => {
    const key = taskKey(index);
    const preset = presetByTask[key] ?? '15';
    const customTime = customTimeByTask[key];
    const reminderTimestamp = preset === 'custom'
      ? new Date(customTime ?? '').getTime()
      : Date.now() + Number(preset) * 60_000;

    if (!Number.isFinite(reminderTimestamp) || reminderTimestamp < Date.now() + 5_000) {
      setActionByTask((current) => ({
        ...current,
        [key]: { message: 'Choose a future time', tone: 'error' },
      }));
      return;
    }

    const remindAt = new Date(reminderTimestamp).toISOString();
    setActionByTask((current) => ({ ...current, [key]: { busy: 'remind' } }));
    try {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: taskPayload(work, index), remindAt }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNow(Date.now());
      setReminderByTask((current) => ({ ...current, [key]: remindAt }));
      setActionByTask((current) => ({
        ...current,
        [key]: { message: 'Reminder queued', tone: 'success' },
      }));
    } catch (error) {
      setActionByTask((current) => ({
        ...current,
        [key]: {
          message: error instanceof Error ? error.message : 'Reminder failed',
          tone: 'error',
        },
      }));
    }
  };

  const countdown = (remindAt: string): string => {
    const remaining = Math.max(0, Date.parse(remindAt) - now);
    if (remaining === 0) return 'SENDING…';
    const totalSeconds = Math.ceil(remaining / 1_000);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
      <button
        type="button"
        className={styles.bookmarkTab}
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls="department-details"
        aria-label={collapsed ? 'Expand department details' : 'Collapse department details'}
      >
        <span>{collapsed ? 'OPEN' : 'INDEX'}</span>
        <strong>{department.code}</strong>
        <i aria-hidden="true">{collapsed ? '‹' : '›'}</i>
      </button>
      <div id="department-details" className={styles.dashboard} aria-hidden={collapsed}>
        <header className={styles.dashboardHeader}>
          <div className={styles.recordLine}>
            <p>SELECTED RECORD</p>
            <span>{department.code}</span>
          </div>
          <div className={styles.dashboardTitleRow}>
            <div className={styles.dashboardTitleCopy}>
              <h2>{department.name}</h2>
              <span className={`${styles.health} ${HEALTH_CLASS[department.health]}`}><i /> {department.health}</span>
            </div>
            <span className={styles.dashboardPlanet}>
              <span className={styles.dashboardPlanetArt}>
                <Image src={department.image} fill sizes="76px" alt="" />
              </span>
            </span>
          </div>
          <p className={styles.description}>{department.description}</p>
          <blockquote>“{department.mission}”</blockquote>
        </header>
        <div className={styles.metrics}>
          <div><strong>{department.people.length}</strong><span>PEOPLE</span></div>
          <div><strong>{activeWork}</strong><span>ACTIVE</span></div>
          <div><strong>{averageProgress}%</strong><span>PROGRESS</span></div>
        </div>
        {focused && (
          <div className={styles.focusNotice}>
            <span>ORBIT FOCUS</span>
            <strong>{focused}</strong>
            <small>Part of the {department.name} constellation</small>
          </div>
        )}
        <section className={styles.dashboardSection}>
          <div className={styles.sectionTitle}><h3>People in orbit</h3><span>{String(department.people.length).padStart(2, '0')}</span></div>
          <div className={styles.peopleList}>
            {department.people.map((person, index) => (
              <article key={person.name} className={focused === person.name ? styles.focusedCard : ''}>
                <span className={styles.personIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.avatar}>{person.initials}</span>
                <span><strong>{person.name}</strong><small>{person.role}</small></span>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.dashboardSection}>
          <div className={styles.sectionTitle}><h3>Sub-teams</h3><span>{String(department.subteams.length).padStart(2, '0')}</span></div>
          <div className={styles.subteamList}>
            {department.subteams.map((team) => (
              <span key={team} className={focused === team ? styles.focusedRow : ''}>{team}</span>
            ))}
          </div>
        </section>
        <section className={styles.dashboardSection}>
          <div className={styles.sectionTitle}><h3>Work in motion</h3><span>{String(department.work.length).padStart(2, '0')}</span></div>
          <div className={styles.workList}>
            {department.work.map((work, index) => (
              <article key={work.title}>
                <div className={styles.workTopline}>
                  <span>{String(index + 1).padStart(2, '0')}</span><strong>{work.title}</strong>
                  <em className={styles[`state${work.state}`]}>{work.state}</em>
                </div>
                <div className={styles.workMeta}><span>{work.owner}</span><span>{work.due}</span><span>{work.progress}%</span></div>
                <div className={styles.progressTrack}><i style={{ width: `${work.progress}%` }} /></div>
                {/* Push and reminder routes only accept live states, so finished work shows no controls. */}
                {work.state !== 'Done' && (
                <div className={styles.taskControls}>
                  <button
                    type="button"
                    onClick={() => void pushTask(work, index)}
                    disabled={Boolean(actionByTask[taskKey(index)]?.busy)}
                  >
                    {actionByTask[taskKey(index)]?.busy === 'push' ? 'PUSHING…' : 'PUSH DISCORD'}
                  </button>
                  <span className={styles.taskControlRule} aria-hidden="true" />
                  <label>
                    <span className={styles.srOnly}>Reminder time for {work.title}</span>
                    <select
                      value={presetByTask[taskKey(index)] ?? '15'}
                      onChange={(event) => {
                        const key = taskKey(index);
                        const value = event.target.value as ReminderPreset;
                        setPresetByTask((current) => ({ ...current, [key]: value }));
                        if (value === 'custom' && !customTimeByTask[key]) {
                          setCustomTimeByTask((current) => ({
                            ...current,
                            [key]: localDateTimeValue(Date.now() + 60 * 60_000),
                          }));
                        }
                      }}
                      disabled={Boolean(actionByTask[taskKey(index)]?.busy)}
                    >
                      <option value="15">15 MIN</option>
                      <option value="60">1 HOUR</option>
                      <option value="1440">1 DAY</option>
                      <option value="custom">CUSTOM…</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void scheduleReminder(work, index)}
                    disabled={Boolean(actionByTask[taskKey(index)]?.busy)}
                  >
                    {actionByTask[taskKey(index)]?.busy === 'remind' ? 'QUEUING…' : 'REMIND'}
                  </button>
                </div>
                )}
                {work.state !== 'Done' && (presetByTask[taskKey(index)] ?? '15') === 'custom' && (
                  <label className={styles.customTimeTag}>
                    <span>CUSTOM TIME</span>
                    <input
                      type="datetime-local"
                      value={customTimeByTask[taskKey(index)] ?? ''}
                      min={localDateTimeValue(Date.now() + 60_000)}
                      onChange={(event) => setCustomTimeByTask((current) => ({
                        ...current,
                        [taskKey(index)]: event.target.value,
                      }))}
                      disabled={Boolean(actionByTask[taskKey(index)]?.busy)}
                      aria-label={`Custom reminder time for ${work.title}`}
                    />
                  </label>
                )}
                {(actionByTask[taskKey(index)]?.message || reminderByTask[taskKey(index)]) && (
                  <div
                    className={`${styles.taskFeedback} ${
                      actionByTask[taskKey(index)]?.tone === 'error' ? styles.taskFeedbackError : ''
                    }`}
                    aria-live="polite"
                  >
                    <span>{actionByTask[taskKey(index)]?.message}</span>
                    {reminderByTask[taskKey(index)] && (
                      <strong>
                        REMIND IN {countdown(reminderByTask[taskKey(index)])}
                      </strong>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <FollowUpButton department={department} />
        </section>
        {(department.updates?.length ?? 0) > 0 && (
          <section className={styles.dashboardSection}>
            <div className={styles.sectionTitle}>
              <h3>Update log</h3>
              <span>DISCORD · {String(department.updates?.length ?? 0).padStart(2, '0')}</span>
            </div>
            <div className={styles.updateList}>
              {department.updates?.map((update) => (
                <article key={`${update.title}-${update.when}`}>
                  <div className={styles.updateTopline}>
                    <strong>{update.title}</strong>
                    <em className={styles[`state${update.state}`]}>{update.state}</em>
                    <span>{timeAgo(update.when)}</span>
                  </div>
                  {update.quote && <p>“{update.quote}”</p>}
                </article>
              ))}
            </div>
          </section>
        )}
        <footer className={styles.dashboardFooter}>
          <span>SYNCED JUST NOW</span><span>ATHENA / KNOWLEDGE GRAPH</span>
        </footer>
      </div>
    </aside>
  );
}

export function ConstellationDashboard() {
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [backendAvailable, setBackendAvailable] = useState(false);
  const { departments, links } = useMemo(() => deriveDepartments(graph), [graph]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [isMapFocused, setIsMapFocused] = useState(false);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = departments.find((item) => item.id === selectedId) ?? departments[0];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchGraph();
        if (!cancelled) {
          setGraph(next);
          setBackendAvailable(true);
        }
      } catch {
        if (!cancelled) setBackendAvailable(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const startHover = (departmentId: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoveredId(departmentId);
  };

  const endHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredId(null), 140);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isIngestOpen) {
          setIsIngestOpen(false);
          return;
        }
        setIsMapFocused(false);
        setFocused(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [isIngestOpen]);

  if (!selected) {
    return (
      <main className={styles.atlas}>
        <AtlasHeader teams={0} bodies={0} live={backendAvailable} onAddMaterials={() => setIsIngestOpen(true)} />
        <section className={styles.emptyAtlas}>
          <p>NO ORGANISATION GRAPH YET</p>
          <h1>Your documents<br /><em>become the map.</em></h1>
          <span>Upload a company corpus, deck, meeting folder or project dataset. Athena will identify the real departments, people, work and dependencies before drawing anything.</span>
          <Link href="/import">Scan a document set →</Link>
        </section>
        {isIngestOpen && (
          <IncrementalIngestModal
            existingGraph={graph}
            onClose={() => setIsIngestOpen(false)}
            onApplied={(nextGraph, newTeamId) => {
              setGraph(nextGraph);
              if (newTeamId) setSelectedId(newTeamId);
            }}
          />
        )}
      </main>
    );
  }

  return (
    <main className={styles.atlas}>
      <AtlasHeader
        teams={departments.length}
        bodies={graph.nodes.length}
        live={backendAvailable}
        onAddMaterials={() => setIsIngestOpen(true)}
      />
      <div className={`${styles.workspace} ${isSidebarCollapsed ? styles.workspaceCollapsed : ''}`}>
        <ConstellationMap
          departments={departments}
          links={links}
          selected={selected}
          hoveredId={hoveredId}
          isFocused={isMapFocused}
          onHoverStart={startHover}
          onHoverEnd={endHover}
          onSelect={(department) => {
            if (isMapFocused && selectedId === department.id) {
              setIsMapFocused(false);
              setFocused(null);
              setHoveredId(null);
              return;
            }
            setSelectedId(department.id);
            setFocused(null);
            setIsMapFocused(true);
          }}
          onSatellite={(department, label) => {
            setSelectedId(department.id);
            setFocused(label);
            setIsMapFocused(true);
          }}
          onReset={() => {
            setIsMapFocused(false);
            setFocused(null);
            setHoveredId(null);
          }}
        />
        <Dashboard
          key={selected.id}
          department={selected}
          focused={focused}
          collapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((value) => !value)}
        />
      </div>
      {isIngestOpen && (
        <IncrementalIngestModal
          existingGraph={graph}
          onClose={() => setIsIngestOpen(false)}
          onApplied={(nextGraph, newTeamId) => {
            setGraph(nextGraph);
            if (newTeamId) {
              setSelectedId(newTeamId);
              setFocused(null);
            }
          }}
        />
      )}
    </main>
  );
}
