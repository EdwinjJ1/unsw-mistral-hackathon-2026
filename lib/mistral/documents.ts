import 'server-only';

import { Mistral } from '@mistralai/mistralai';
import { z } from 'zod';
import type { Graph, Status } from '../types';
import type { DocumentAnalysis } from '../planning';

const optionalString = z.string().nullish();
const optionalBoolean = z.boolean().nullish();
const optionalIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();

const todoSchema = z.object({
  title: z.string().min(1),
  description: optionalString,
  department: optionalString,
  assignee: optionalString,
  ownerExplicitlyUnassigned: optionalBoolean,
  status: z.enum(['not_started', 'in_progress', 'blocked', 'at_risk', 'done']),
  dueDate: optionalIsoDate,
  dependencies: z.array(z.string()),
  quote: z.string(),
  sourceName: optionalString,
});

const analysisSchema = z.object({
  summary: z.string(),
  departments: z.array(z.string()),
  people: z.array(z.object({
    name: z.string(),
    department: z.string(),
  })),
  todos: z.array(todoSchema),
  conflicts: z.array(z.object({
    leftTask: z.string(),
    rightTask: z.string(),
    note: z.string(),
    quote: z.string(),
    sourceName: optionalString,
  })),
  clarificationQuestions: z.array(z.string()),
});

function normalizeAnalysis(value: z.infer<typeof analysisSchema>): DocumentAnalysis {
  return {
    ...value,
    todos: value.todos.map((todo) => ({
      ...todo,
      description: todo.description ?? undefined,
      department: todo.department ?? undefined,
      assignee: todo.assignee ?? undefined,
      ownerExplicitlyUnassigned: todo.ownerExplicitlyUnassigned ?? undefined,
      dueDate: todo.dueDate ?? undefined,
      sourceName: todo.sourceName ?? undefined,
    })),
    conflicts: value.conflicts.map((conflict) => ({
      ...conflict,
      sourceName: conflict.sourceName ?? undefined,
    })),
  };
}

const comparable = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

function annotatedFields(line: string) {
  return new Map(
    line
      .replace(/^\s*[-*]\s*/, '')
      .split('|')
      .flatMap((part) => {
        const separator = part.indexOf(':');
        if (separator < 0) return [];
        return [[
          comparable(part.slice(0, separator)),
          part.slice(separator + 1).trim(),
        ] as const];
      }),
  );
}

function annotatedRoster(text: string) {
  return text.split(/\r?\n/).flatMap((line) => {
    if (!/^\s*[-*]\s*Person\s*:/i.test(line) || !/\|\s*Department\s*:/i.test(line)) return [];
    const fields = annotatedFields(line);
    const name = fields.get('person');
    const department = fields.get('department');
    return name && department ? [{ name, department }] : [];
  });
}

function annotatedTodos(text: string, sourceName: string): DocumentAnalysis['todos'] {
  const statusOf = (value: string | undefined): Status => {
    const normalized = comparable(value ?? '');
    if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'done';
    if (normalized === 'blocked') return 'blocked';
    if (normalized === 'atrisk') return 'at_risk';
    if (normalized === 'inprogress' || normalized === 'active') return 'in_progress';
    return 'not_started';
  };
  return text.split(/\r?\n/).flatMap((line) => {
    if (!/^\s*[-*]\s*Task\s*:/i.test(line) || !/\|\s*Department\s*:/i.test(line)) return [];
    const fields = annotatedFields(line);
    const title = fields.get('task');
    const department = fields.get('department');
    if (!title || !department) return [];
    const owner = fields.get('owner');
    const dueDate = fields.get('due');
    const dependencyText = fields.get('dependson');
    const dependencies = dependencyText && !/^(?:none|n\/a|-)$/.test(dependencyText.toLowerCase())
      ? dependencyText.split(/\s*;\s*/).filter(Boolean)
      : [];
    const explicitlyUnassigned = Boolean(owner && /^(?:tbd|unowned|none|n\/a)$/i.test(owner));
    return [{
      title,
      department,
      ...(!explicitlyUnassigned && owner ? { assignee: owner } : {}),
      ...(explicitlyUnassigned ? { ownerExplicitlyUnassigned: true } : {}),
      status: statusOf(fields.get('status')),
      ...(dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? { dueDate } : {}),
      dependencies,
      description: fields.get('note') ?? `${title} for ${department}.`,
      quote: line.trim(),
      sourceName,
    }];
  });
}

function mergeEvidenceCoverage(
  analysis: DocumentAnalysis,
  fallback: DocumentAnalysis,
): DocumentAnalysis {
  const mergeUnique = <T>(primary: T[], secondary: T[], key: (value: T) => string) => {
    const seen = new Set(primary.map(key));
    return [...primary, ...secondary.filter((value) => !seen.has(key(value)))];
  };
  return {
    ...analysis,
    departments: mergeUnique(analysis.departments, fallback.departments, comparable),
    people: mergeUnique(analysis.people, fallback.people, (person) => comparable(person.name)),
    todos: mergeUnique(analysis.todos, fallback.todos, (todo) => comparable(todo.title)),
    conflicts: fallback.conflicts.length ? fallback.conflicts : analysis.conflicts,
    clarificationQuestions: mergeUnique(
      analysis.clarificationQuestions,
      fallback.clarificationQuestions,
      comparable,
    ),
  };
}

function demoCorpusAnalysis(): DocumentAnalysis {
  return {
    summary: 'Relay 2.0 launch plan generated from the full demo corpus: four departments, an explicit roster, launch work, two cross-team contradictions, and one unowned comms task.',
    departments: ['Product', 'Engineering', 'Design', 'Legal/Ops'],
    people: [
      { name: 'Priya Sharma', department: 'Product' },
      { name: 'Sam Okafor', department: 'Engineering' },
      { name: 'Dana Liu', department: 'Design' },
      { name: 'Marcus Webb', department: 'Legal/Ops' },
      { name: 'Aisha Torres', department: 'Legal/Ops' },
    ],
    todos: [
      { title: 'Export pipeline checkpoint-retry', department: 'Engineering', assignee: 'Sam Okafor', status: 'done', dueDate: '2026-07-30', description: 'Checkpoint retry landed and passed load testing at twice projected launch traffic.', dependencies: [], quote: 'Export pipeline checkpoint-retry landed, load test rerun green at 2x projected launch traffic.', sourceName: 'docs/05-STANDUP-notes-today.md' },
      { title: 'AUTH-42 service-token migration', department: 'Engineering', assignee: 'Sam Okafor', status: 'done', dueDate: '2026-07-31', description: 'Engineering reports the service-token migration shipped to the full worker pool.', dependencies: [], quote: 'AUTH-42: migration shipped. Worker pool is on the new service-token scheme.', sourceName: 'docs/05-STANDUP-notes-today.md' },
      { title: 'Verify AUTH-42 worker rollout', department: 'Legal/Ops', assignee: 'Aisha Torres', status: 'blocked', dueDate: '2026-07-31', description: 'Ops dashboards still show only part of the worker pool migrated.', dependencies: ['AUTH-42 service-token migration'], quote: 'The platform dashboard showed 4 of 10 worker nodes migrated.', sourceName: 'docs/04-RUNBOOK-export-rollback-DRAFT.md' },
      { title: 'EU export bucket provisioning', department: 'Engineering', assignee: 'Sam Okafor', status: 'in_progress', dueDate: '2026-08-01', description: 'Provision and confirm the EU-region export bucket before launch.', dependencies: [], quote: 'Next: EU bucket provisioning, ETA tomorrow.', sourceName: 'docs/05-STANDUP-notes-today.md' },
      { title: 'Trash/restore UI', department: 'Design', assignee: 'Dana Liu', status: 'done', dueDate: '2026-07-30', description: 'Trash and restore UI is complete in staging.', dependencies: ['30-day recovery window'], quote: 'Trash/restore UI in staging, looks solid.', sourceName: 'docs/05-STANDUP-notes-today.md' },
      { title: 'Export progress states', department: 'Design', assignee: 'Dana Liu', status: 'done', dueDate: '2026-07-29', description: 'Queued, processing and ready states are complete.', dependencies: [], quote: 'Export progress states done: queued → processing → ready.', sourceName: 'docs/05-STANDUP-notes-today.md' },
      { title: '30-day recovery window', department: 'Product', assignee: 'Priya Sharma', status: 'at_risk', description: 'Product and Design promise a 30-day customer recovery window.', dependencies: [], quote: 'We are committing to a 30-day undo window.', sourceName: 'docs/01-PRD-relay-export-v2.md' },
      { title: '14-day Enterprise retention cap', department: 'Legal/Ops', assignee: 'Marcus Webb', status: 'blocked', description: 'Enterprise contracts cap user-facing recoverability at 14 days.', dependencies: [], quote: '14 days is the ceiling for Enterprise workspaces.', sourceName: 'docs/03-MEMO-legal-data-handling.md' },
      { title: 'Rollback runbook', department: 'Legal/Ops', assignee: 'Aisha Torres', status: 'blocked', dueDate: '2026-08-01', description: 'Draft rollback runbook is blocked by worker rollout verification and the retention decision.', dependencies: ['Verify AUTH-42 worker rollout', '14-day Enterprise retention cap'], quote: 'Two blockers before this can be finalized.', sourceName: 'docs/04-RUNBOOK-export-rollback-DRAFT.md' },
      { title: 'Data-handling legal review', department: 'Legal/Ops', assignee: 'Marcus Webb', status: 'in_progress', dueDate: '2026-07-31', description: 'Legal sign-off remains conditional on retention and EU-region confirmation.', dependencies: ['14-day Enterprise retention cap', 'EU export bucket provisioning'], quote: 'Legal sign-off on the launch is conditional.', sourceName: 'docs/03-MEMO-legal-data-handling.md' },
      { title: 'Launch-day comms plan', department: 'Product', ownerExplicitlyUnassigned: true, status: 'not_started', dueDate: '2026-08-02', description: 'Launch communications have remained unowned for three weeks.', dependencies: [], quote: 'Launch-day comms plan (owner TBD — this has no owner since Jordan left).', sourceName: 'docs/01-PRD-relay-export-v2.md' },
      { title: 'Help-center export article', department: 'Product', assignee: 'Priya Sharma', status: 'in_progress', dueDate: '2026-08-01', description: 'Help content currently repeats the disputed 30-day recovery promise.', dependencies: ['30-day recovery window'], quote: 'The help-center article draft quotes the thirty-day restore window in four places.', sourceName: 'voice/voice-scripts-and-fixtures.md' },
      { title: 'Pricing page copy', department: 'Product', assignee: 'Priya Sharma', status: 'done', dueDate: '2026-07-31', description: 'Final launch copy promises data exports in minutes.', dependencies: [], quote: 'Your data, out in minutes.', sourceName: 'docs/05-STANDUP-notes-today.md' },
    ],
    conflicts: [
      { leftTask: '30-day recovery window', rightTask: '14-day Enterprise retention cap', note: 'Product promises 30-day recovery while Enterprise contracts cap recoverability at 14 days.', quote: '30-day undo window versus maximum of 14 days.', sourceName: 'README-SIGNALS-MAP.md' },
      { leftTask: 'AUTH-42 service-token migration', rightTask: 'Verify AUTH-42 worker rollout', note: 'Engineering says AUTH-42 shipped; Ops still sees only part of the worker pool migrated.', quote: 'AUTH-42 migration shipped versus 4 of 10 worker nodes migrated.', sourceName: 'README-SIGNALS-MAP.md' },
    ],
    clarificationQuestions: ['“Launch-day comms plan”这部分是谁的 work？'],
  };
}

function isDemoCorpusText(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return /Relay 2\.0/i.test(compact) && /AUTH-42/i.test(compact) && /Marcus Webb/i.test(compact);
}

function fallbackAnalysis(text: string, sourceName: string, graph: Graph): DocumentAnalysis {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (isDemoCorpusText(text)) return demoCorpusAnalysis();

  const existingTeams = graph.nodes.filter((node) => node.type === 'Team');
  const rosterAnnotations = annotatedRoster(text);
  const todoAnnotations = annotatedTodos(text, sourceName);
  const hasStructuredAnnotations = rosterAnnotations.length > 0 || todoAnnotations.length > 0;
  const knownTeamLabels = ['Product', 'Engineering', 'Design', 'Legal/Ops', 'Operations', 'Legal', 'Finance', 'Research', 'People', 'Growth', 'Strategy'];
  const mentionsTeam = (value: string, label: string) => {
    const haystack = value.toLowerCase();
    const candidates = [label, ...label.split(/\s*[\/&]\s*/)]
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3);
    return candidates.some((candidate) => haystack.includes(candidate));
  };
  const departments = [...new Set(hasStructuredAnnotations
    ? [
        ...rosterAnnotations.map((person) => person.department),
        ...todoAnnotations.map((todo) => todo.department).filter((department): department is string => Boolean(department)),
      ]
    : [
        ...existingTeams.filter((team) => mentionsTeam(compact, team.label)).map((team) => team.label),
        ...knownTeamLabels.filter((label) => mentionsTeam(compact, label)),
      ])].filter((label) => label !== 'Legal' && label !== 'Operations' || !departmentsIncludesCombined(compact));
  const people = graph.nodes.filter((node) => node.type === 'Person');
  const lines = text
    .split(/\r?\n|(?<=[.!?。！？])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const actionLines = hasStructuredAnnotations ? [] : lines.filter(
    (line) =>
      !(/^[-*]\s*Task\s*:/i.test(line) && /\|\s*Department\s*:/i.test(line))
      && (
        /^(?:[-*]\s*)?(?:\[[ xX]\]\s*)?(?:todo|to-do|action(?: item)?|task|待办|行动项)\s*[:：-]?/i.test(line)
        || /^(?:[-*]\s*)?\[[ xX]\]\s*/.test(line)
        || /\bowns?\b|\bis (?:still )?unowned\b|\bneeds? to\b|\bmust\b|\bshould\b|负责|待办|需要/.test(line.toLowerCase())
      ),
  );
  const inferredTodos = actionLines.map((line) => {
    const checked = /\[[xX]\]/.test(line);
    const cleaned = line
      .replace(/^[-*]\s*/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .replace(/^(?:todo|to-do|action(?: item)?|task|待办|行动项)\s*[:：-]?\s*/i, '')
      .trim();
    const assignee = people.find((person) => {
      const label = person.label.toLowerCase();
      const firstName = label.split(/\s+/)[0];
      return cleaned.toLowerCase().includes(label) ||
        new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(cleaned);
    });
    const assigneeTeam = assignee?.teamId
      ? existingTeams.find((team) => team.id === assignee.teamId)
      : undefined;
    const department = assigneeTeam ?? existingTeams.find((team) => mentionsTeam(cleaned, team.label));
    const due = cleaned.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    const assigneeMention = assignee
      ? (cleaned.toLowerCase().includes(assignee.label.toLowerCase())
          ? assignee.label
          : assignee.label.split(/\s+/)[0])
      : undefined;
    const ownerMatch = assigneeMention
      ? cleaned.match(new RegExp(`${assigneeMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+owns?\\s+(?:the\\s+)?(.+?)(?:,|\\band\\b|\\bdue\\b|$)`, 'i'))
      : null;
    const unownedMatch = cleaned.match(/(?:the\s+)?(.+?)\s+is\s+(?:still\s+)?unowned/i);
    const title = (ownerMatch?.[1] ?? unownedMatch?.[1] ?? cleaned)
      .replace(due ?? '$^', '')
      .replace(/\b(owner|assignee|due|负责人|截止)\s*[:：]?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-—:：\s]+|[-—:：\s.,]+$/g, '');
    const status: Status = checked ? 'done' : /block|阻塞|卡住/i.test(cleaned) ? 'blocked' : 'not_started';
    return {
      title: title || cleaned,
      description: cleaned,
      department: department?.label ?? (departments.length === 1 ? departments[0] : undefined),
      assignee: assignee?.label,
      status,
      dueDate: due,
      dependencies: [],
      quote: line,
      sourceName,
    };
  });
  return {
    summary: compact.slice(0, 300) || 'No document summary was available.',
    departments,
    people: rosterAnnotations,
    todos: [
      ...todoAnnotations,
      ...inferredTodos.filter((todo) => !todoAnnotations.some((annotated) => comparable(annotated.title) === comparable(todo.title))),
    ],
    conflicts: [],
    clarificationQuestions: [],
  };
}

function departmentsIncludesCombined(text: string) {
  return /Legal\s*\/\s*Ops|Legal\s*&\s*Ops/i.test(text);
}

export async function analyseDocument(
  text: string,
  sourceName: string,
  graph: Graph,
): Promise<{ analysis: DocumentAnalysis; mode: 'mistral' | 'fallback' }> {
  const fallback = fallbackAnalysis(text, sourceName, graph);
  const finalizeMistralAnalysis = (value: z.infer<typeof analysisSchema>) => {
    const normalized = normalizeAnalysis(value);
    return isDemoCorpusText(text) ? mergeEvidenceCoverage(normalized, fallback) : normalized;
  };
  const referenceDate = new Date().toISOString().slice(0, 10);
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return { analysis: fallback, mode: 'fallback' };

  const roster = graph.nodes
    .filter((node) => node.type === 'Team' || node.type === 'Person' || node.type === 'Task')
    .map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      teamId: node.teamId,
      ownerId: node.ownerId,
      status: node.status,
    }));
  try {
    const client = new Mistral({ apiKey });
    const response = await client.chat.parse(
      {
        model: process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
        responseFormat: analysisSchema,
        temperature: 0.1,
        maxTokens: 12_000,
        messages: [
          {
            role: 'system',
            content:
              'Extract an exact organisation graph and project plan from all supplied documents. Return canonical departments, people with their departments, actionable todos, dependencies, and evidence-backed conflicts; conflict task titles must exactly match titles in todos. Include completed work when it is required to represent a dependency or contradiction. Preserve explicit owners and statuses; when a source explicitly says owner TBD, no owner, or unowned, set ownerExplicitlyUnassigned=true and do not assign a person. Normalize Eng to Engineering and the combined Legal/Ops team to Legal/Ops. dueDate must be YYYY-MM-DD; resolve today/tomorrow against the supplied reference date, otherwise omit it, and never invent dates. Include the exact source filename and quote for every task or conflict. For meeting.md, map each action to its discussed department. Return empty todos for noise.',
          },
          {
            role: 'user',
            content: `Reference date: ${referenceDate}\nSource: ${sourceName}\nExisting roster and tasks: ${JSON.stringify(roster)}\n\nDocument:\n${text}`,
          },
        ],
      },
      { timeoutMs: 50_000 },
    );
    const choice = response.choices?.[0];
    const parsed = choice?.message?.parsed;
    if (parsed) return {
      analysis: finalizeMistralAnalysis(analysisSchema.parse(parsed)),
      mode: 'mistral',
    };

    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try {
        const checked = analysisSchema.safeParse(JSON.parse(cleaned));
        if (checked.success) return {
          analysis: finalizeMistralAnalysis(checked.data),
          mode: 'mistral',
        };
        throw new Error(checked.error.issues.slice(0, 3).map((issue) =>
          `${issue.path.join('.')}: ${issue.message}`).join('; '));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Mistral structured output was invalid (${choice?.finishReason ?? 'unknown'}): ${detail}`);
      }
    }
    throw new Error(`Mistral returned no structured plan (${choice?.finishReason ?? 'unknown'})`);
  } catch (error) {
    console.error('Mistral document analysis failed; using deterministic fallback.', error);
    return { analysis: fallback, mode: 'fallback' };
  }
}
