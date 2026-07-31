'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { fetchGraph } from '@/lib/client-api';
import type { Graph, Status } from '@/lib/types';
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
};

const ART_DEPARTMENTS: Department[] = [
  {
    id: 'engineering', name: 'Engineering', code: 'ENG · 01',
    image: '/planets/cutouts/earth.webp', x: 15, y: 49, size: 224, health: 'Watch',
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
    image: '/planets/cutouts/jupiter.webp', x: 38, y: 18, size: 106, health: 'On track',
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
    image: '/planets/cutouts/saturn.webp', x: 60, y: 28, size: 126, health: 'On track',
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
    image: '/planets/cutouts/neptune.webp', x: 78, y: 13, size: 88, health: 'On track',
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
    image: '/planets/cutouts/mars.webp', x: 48, y: 61, size: 98, health: 'At risk',
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
    image: '/planets/cutouts/venus.webp', x: 72, y: 54, size: 90, health: 'On track',
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
    image: '/planets/cutouts/sun.webp', x: 32, y: 82, size: 86, health: 'Watch',
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
    image: '/planets/cutouts/mercury.webp', x: 62, y: 84, size: 78, health: 'On track',
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
    image: '/planets/cutouts/moon.webp', x: 87, y: 80, size: 72, health: 'Watch',
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
    image: '/planets/cutouts/strategic.webp', x: 87, y: 39, size: 96, health: 'On track',
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
const HEALTH_CLASS: Record<Health, string> = {
  'On track': styles.healthGood, Watch: styles.healthWatch, 'At risk': styles.healthRisk,
};

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

function AtlasHeader({ teams, bodies, live }: { teams: number; bodies: number; live: boolean }) {
  return (
    <header className={styles.atlasHeader}>
      <div className={styles.brandLockup}>
        <span className={styles.brandMark}>A</span>
        <span><strong>Athena</strong><small>ORGANISATION ATLAS</small></span>
      </div>
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

function MapLegend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendPlanet} /><span>Department</span>
      <span className={styles.legendMoon} /><span>Hover for orbit</span>
      <span className={styles.legendLine} /><span>Collaboration</span>
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
  const highlightedId = hoveredId ?? selected.id;
  const cameraStyle = {
    '--camera-x': `${50 - selected.x}%`,
    '--camera-y': `${51 - selected.y}%`,
  } as CSSProperties;

  return (
    <section className={`${styles.mapPanel} ${isFocused ? styles.mapPanelFocused : ''}`} aria-label="Interactive organisation constellation">
      <div className={styles.mapIntro}>
        <p>01 / LIVING ORGANISATION</p>
        <h1>One company,<br /><em>in orbit.</em></h1>
        <span>Hover to reveal · Select to explore</span>
      </div>
      {isFocused && (
        <button type="button" className={styles.resetView} onClick={onReset}>
          <span>←</span> RETURN TO CONSTELLATION
        </button>
      )}
      <div
        className={`${styles.chart} ${isFocused ? styles.chartFocused : ''}`}
        style={cameraStyle}
      >
        <svg className={styles.network} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
          {hoveredId && SATELLITE_OFFSETS.map((offset, index) => {
            const department = byId.get(hoveredId);
            if (!department) return null;
            return (
              <path
                key={`${hoveredId}-orbit-${index}`}
                d={`M ${department.x} ${department.y} Q ${department.x + offset.x * 0.52 + (index % 2 ? 1.4 : -1.4)} ${department.y + offset.y * 0.38} ${department.x + offset.x} ${department.y + offset.y}`}
                className={styles.orbitLine}
              />
            );
          })}
        </svg>
        {departments.map((department, departmentIndex) => {
          const isSelected = department.id === selected.id;
          const isOrbiting = department.id === hoveredId;
          const orbitDetails = [
            ...department.people.slice(0, 2).map((person) => ({ label: person.name, meta: person.role, size: 16 })),
            ...department.subteams.slice(0, 2).map((label) => ({ label, meta: 'Connected team', size: 21 })),
            ...department.work.slice(0, 4).map((work) => ({ label: work.title, meta: 'Work item', size: 18 })),
          ].slice(0, 4);
          return (
            <div key={department.id}>
              <button
                type="button"
                className={[
                  styles.planetButton,
                  isSelected ? styles.planetSelected : '',
                  isSelected && isFocused ? styles.planetInFocus : '',
                  hoveredId && !isOrbiting ? styles.planetMuted : '',
                ].join(' ')}
                style={{
                  left: `${department.x}%`, top: `${department.y}%`,
                  width: department.size, height: department.size, zIndex: isOrbiting ? 9 : isSelected ? 8 : 4,
                  '--float-delay': `${departmentIndex * -0.7}s`,
                } as CSSProperties}
                onClick={() => onSelect(department)}
                onMouseEnter={() => onHoverStart(department.id)}
                onMouseLeave={onHoverEnd}
                onFocus={() => onHoverStart(department.id)}
                onBlur={onHoverEnd}
                aria-label={`Open ${department.name} department`}
                aria-pressed={isSelected && isFocused}
              >
                <span className={styles.planetVisual}>
                  <span className={styles.planetHalo} />
                  <Image className={styles.planetImage} src={department.image} alt="" fill sizes="(max-width: 900px) 130px, 224px" priority={departmentIndex === 0} />
                </span>
                <span className={styles.planetCaption}><strong>{department.name}</strong><small>{department.code}</small></span>
              </button>
              {SATELLITE_OFFSETS.slice(0, orbitDetails.length).map((offset, index) => {
                const detail = orbitDetails[index];
                return (
                  <Fragment key={`${department.id}-${detail.label}`}>
                    <button
                      type="button"
                      className={`${styles.satellite} ${isOrbiting ? styles.satelliteVisible : ''}`}
                      style={{
                        left: `${department.x + offset.x}%`,
                        top: `${department.y + offset.y}%`,
                        '--satellite-delay': `${index * 42}ms`,
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
                  </Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
      <MapLegend />
      <div className={styles.mapIndex}>ATHENA / PLATE No. 07</div>
    </section>
  );
}

function Dashboard({ department, focused }: { department: Department; focused: string | null }) {
  const activeWork = department.work.filter((item) => item.state === 'Active').length;
  const averageProgress = department.work.length
    ? Math.round(department.work.reduce((sum, item) => sum + item.progress, 0) / department.work.length)
    : 0;
  return (
    <aside className={styles.sidebar} aria-live="polite">
      <div className={styles.bookmarkTab} aria-hidden="true"><span>{department.code}</span></div>
      <div className={styles.dashboard}>
        <header className={styles.dashboardHeader}>
          <div className={styles.recordLine}>
            <p>SELECTED RECORD</p>
            <span>{department.code}</span>
          </div>
          <div className={styles.dashboardTitleRow}>
            <div>
              <h2>{department.name}</h2>
              <span className={`${styles.health} ${HEALTH_CLASS[department.health]}`}><i /> {department.health}</span>
            </div>
            <span className={styles.dashboardPlanet}><Image src={department.image} fill sizes="72px" alt="" /></span>
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
              </article>
            ))}
          </div>
        </section>
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
        setIsMapFocused(false);
        setFocused(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  if (!selected) {
    return (
      <main className={styles.atlas}>
        <AtlasHeader teams={0} bodies={0} live={backendAvailable} />
        <section className={styles.emptyAtlas}>
          <p>NO ORGANISATION GRAPH YET</p>
          <h1>Your documents<br /><em>become the map.</em></h1>
          <span>Upload a company corpus, deck, meeting folder or project dataset. Athena will identify the real departments, people, work and dependencies before drawing anything.</span>
          <Link href="/import">Scan a document set →</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.atlas}>
      <AtlasHeader teams={departments.length} bodies={graph.nodes.length} live={backendAvailable} />
      <div className={styles.workspace}>
        <ConstellationMap
          departments={departments}
          links={links}
          selected={selected}
          hoveredId={hoveredId}
          isFocused={isMapFocused}
          onHoverStart={startHover}
          onHoverEnd={endHover}
          onSelect={(department) => {
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
          }}
        />
        <Dashboard department={selected} focused={focused} />
      </div>
    </main>
  );
}
