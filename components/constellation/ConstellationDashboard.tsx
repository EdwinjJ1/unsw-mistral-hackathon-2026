'use client';

import Image from 'next/image';
import { Fragment, useMemo, useState } from 'react';
import styles from './constellation.module.css';

type Health = 'On track' | 'Watch' | 'At risk';
type Person = { name: string; role: string; initials: string };
type WorkItem = {
  title: string;
  owner: string;
  progress: number;
  due: string;
  state: 'Active' | 'Review' | 'Blocked';
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

const DEPARTMENTS: Department[] = [
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

const NETWORK_LINKS = [
  ['engineering', 'product'], ['engineering', 'operations'], ['engineering', 'research'],
  ['product', 'design'], ['product', 'growth'], ['design', 'people'], ['design', 'research'],
  ['research', 'strategy'], ['operations', 'people'], ['operations', 'finance'],
  ['people', 'legal'], ['growth', 'finance'], ['finance', 'legal'], ['legal', 'strategy'],
] as const;
const SATELLITE_OFFSETS = [
  { x: -8, y: -10 }, { x: 9, y: -8 }, { x: -10, y: 10 }, { x: 10, y: 10 },
];
const HEALTH_CLASS: Record<Health, string> = {
  'On track': styles.healthGood, Watch: styles.healthWatch, 'At risk': styles.healthRisk,
};

function AtlasHeader() {
  return (
    <header className={styles.atlasHeader}>
      <div className={styles.brandLockup}>
        <span className={styles.brandMark}>A</span>
        <span><strong>ATHENA</strong><small>ORGANISATION ATLAS</small></span>
      </div>
      <div className={styles.headerMeta}>
        <span><i className={styles.liveDot} /> LIVE MAP</span>
        <span>50 BODIES</span>
        <span>31 JUL 2026</span>
      </div>
    </header>
  );
}

function MapLegend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendPlanet} /><span>Department</span>
      <span className={styles.legendMoon} /><span>Person / sub-team</span>
      <span className={styles.legendLine} /><span>Collaboration</span>
    </div>
  );
}

function ConstellationMap({
  selected, hoveredId, onHover, onSelect, onSatellite,
}: {
  selected: Department;
  hoveredId: string | null;
  onHover: (departmentId: string | null) => void;
  onSelect: (department: Department) => void;
  onSatellite: (department: Department, label: string) => void;
}) {
  const byId = useMemo(() => new Map(DEPARTMENTS.map((item) => [item.id, item])), []);
  const orbitingId = hoveredId ?? selected.id;
  return (
    <section className={styles.mapPanel} aria-label="Interactive organisation constellation">
      <div className={styles.mapIntro}>
        <p>01 / ORGANISATION</p>
        <h1>A living company<br />constellation.</h1>
        <span>Select any planet to inspect its orbit.</span>
      </div>
      <div className={styles.chart}>
        <svg className={styles.network} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {NETWORK_LINKS.map(([fromId, toId], index) => {
            const from = byId.get(fromId);
            const to = byId.get(toId);
            if (!from || !to) return null;
            return (
              <path
                key={`${fromId}-${toId}`}
                d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + (index % 2 ? 4 : -4)} ${to.x} ${to.y}`}
                className={orbitingId === fromId || orbitingId === toId ? styles.networkActive : styles.networkLine}
              />
            );
          })}
          {DEPARTMENTS.flatMap((department) =>
            SATELLITE_OFFSETS.map((offset, index) => (
              <path
                key={`${department.id}-sat-${index}`}
                d={`M ${department.x} ${department.y} Q ${department.x + offset.x * 0.55 + (index % 2 ? 1.5 : -1.5)} ${department.y + offset.y * 0.35} ${department.x + offset.x} ${department.y + offset.y}`}
                className={orbitingId === department.id ? styles.orbitLineHidden : styles.orbitLine}
              />
            )),
          )}
        </svg>
        {DEPARTMENTS.map((department, departmentIndex) => {
          const isSelected = department.id === selected.id;
          const isOrbiting = department.id === orbitingId;
          return (
            <div key={department.id}>
              <button
                type="button"
                className={`${styles.planetButton} ${isSelected ? styles.planetSelected : ''}`}
                style={{
                  left: `${department.x}%`, top: `${department.y}%`,
                  width: department.size, height: department.size, zIndex: isSelected ? 8 : isOrbiting ? 7 : 4,
                  '--float-delay': `${departmentIndex * -0.7}s`,
                } as React.CSSProperties}
                onClick={() => onSelect(department)}
                onMouseEnter={() => onHover(department.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(department.id)}
                onBlur={() => onHover(null)}
                aria-label={`Open ${department.name} department`}
              >
                <span className={styles.planetHalo} />
                <Image className={styles.planetImage} src={department.image} alt="" fill sizes="(max-width: 900px) 130px, 224px" priority={department.id === 'engineering'} />
                <span className={styles.planetCaption}><strong>{department.name}</strong><small>{department.code}</small></span>
              </button>
              {SATELLITE_OFFSETS.map((offset, index) => {
                const label = index < 2 ? department.people[index].name : department.subteams[index];
                const orbitAngle = index * 90 - 45;
                const orbitRadius = Math.max(56, department.size * 0.52 + 34);
                const orbitStyle = {
                  '--orbit-angle': `${orbitAngle}deg`,
                  '--orbit-angle-neg': `${-orbitAngle}deg`,
                  '--orbit-radius': `${orbitRadius}px`,
                } as React.CSSProperties;
                return (
                  <Fragment key={`${department.id}-${label}`}>
                    {isOrbiting && (
                      <span
                        className={styles.orbitConnector}
                        style={{
                          left: `${department.x}%`,
                          top: `${department.y}%`,
                          ...orbitStyle,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className={`${styles.satellite} ${isOrbiting ? styles.satelliteSelected : ''}`}
                      style={{
                        left: `${isOrbiting ? department.x : department.x + offset.x}%`,
                        top: `${isOrbiting ? department.y : department.y + offset.y}%`,
                        '--satellite-delay': `${-(departmentIndex + index) * 0.45}s`,
                        ...orbitStyle,
                      } as React.CSSProperties}
                      onClick={() => onSatellite(department, label)}
                      aria-label={`Open ${label} in ${department.name}`}
                    >
                      <Image src="/planets/cutouts/moon.webp" width={index < 2 ? 17 : 22} height={index < 2 ? 17 : 22} alt="" />
                      <span>{index < 2 ? label.split(' ')[0] : label}</span>
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
  const averageProgress = Math.round(department.work.reduce((sum, item) => sum + item.progress, 0) / department.work.length);
  return (
    <aside className={styles.dashboard} aria-live="polite">
      <header className={styles.dashboardHeader}>
        <p>DEPARTMENT / {department.code}</p>
        <div className={styles.dashboardTitleRow}>
          <span className={styles.dashboardPlanet}><Image src={department.image} fill sizes="72px" alt="" /></span>
          <div>
            <h2>{department.name}</h2>
            <span className={`${styles.health} ${HEALTH_CLASS[department.health]}`}><i /> {department.health}</span>
          </div>
        </div>
        <p className={styles.description}>{department.description}</p>
        <blockquote>“{department.mission}”</blockquote>
      </header>
      <div className={styles.metrics}>
        <div><strong>{department.people.length}</strong><span>PEOPLE</span></div>
        <div><strong>{department.subteams.length}</strong><span>SUB-TEAMS</span></div>
        <div><strong>{activeWork}</strong><span>ACTIVE WORK</span></div>
        <div><strong>{averageProgress}%</strong><span>AVG. PROGRESS</span></div>
      </div>
      {focused && (
        <div className={styles.focusNotice}>
          <span>IN FOCUS</span><strong>{focused}</strong><small>inside the {department.name} orbit</small>
        </div>
      )}
      <section className={styles.dashboardSection}>
        <div className={styles.sectionTitle}><h3>People in orbit</h3><span>{String(department.people.length).padStart(2, '0')}</span></div>
        <div className={styles.peopleGrid}>
          {department.people.map((person) => (
            <article key={person.name} className={focused === person.name ? styles.focusedCard : ''}>
              <span className={styles.avatar}>{person.initials}</span>
              <span><strong>{person.name}</strong><small>{person.role}</small></span>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.dashboardSection}>
        <div className={styles.sectionTitle}><h3>Smaller departments</h3><span>{String(department.subteams.length).padStart(2, '0')}</span></div>
        <div className={styles.subteamList}>
          {department.subteams.map((team, index) => (
            <div key={team} className={focused === team ? styles.focusedRow : ''}>
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{team}</strong>
              <small>{5 + ((index * 3 + department.name.length) % 8)} members</small>
            </div>
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
              <div className={styles.workMeta}><span>{work.owner}</span><span>DUE {work.due.toUpperCase()}</span><span>{work.progress}%</span></div>
              <div className={styles.progressTrack}><i style={{ width: `${work.progress}%` }} /></div>
            </article>
          ))}
        </div>
      </section>
      <footer className={styles.dashboardFooter}><span>LAST SYNC · JUST NOW</span><span>ATHENA KNOWLEDGE GRAPH</span></footer>
    </aside>
  );
}

export function ConstellationDashboard() {
  const [selectedId, setSelectedId] = useState('engineering');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const selected = DEPARTMENTS.find((item) => item.id === selectedId) ?? DEPARTMENTS[0];
  return (
    <main className={styles.atlas}>
      <AtlasHeader />
      <div className={styles.workspace}>
        <ConstellationMap
          selected={selected}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onSelect={(department) => { setSelectedId(department.id); setFocused(null); }}
          onSatellite={(department, label) => { setSelectedId(department.id); setFocused(label); }}
        />
        <Dashboard department={selected} focused={focused} />
      </div>
    </main>
  );
}
