import type {
  AssignmentReason,
  DeliveryPlan,
  Delta,
  Graph,
  GraphEdge,
  GraphNode,
  PlanAssignment,
  SourceRef,
  Status,
} from './types';

export interface AnalysedTodo {
  title: string;
  description?: string;
  department?: string;
  assignee?: string;
  ownerExplicitlyUnassigned?: boolean;
  status: Status;
  dueDate?: string;
  dependencies: string[];
  quote: string;
  sourceName?: string;
}

export interface AnalysedPerson {
  name: string;
  department: string;
}

export interface AnalysedConflict {
  leftTask: string;
  rightTask: string;
  note: string;
  quote: string;
  sourceName?: string;
}

export interface DocumentAnalysis {
  summary: string;
  departments: string[];
  people: AnalysedPerson[];
  todos: AnalysedTodo[];
  conflicts: AnalysedConflict[];
  clarificationQuestions: string[];
}

const slug = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'untitled';

const comparable = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

function findTeam(graph: Graph, name?: string) {
  if (!name) return undefined;
  const target = comparable(name).replace(/department|team|部门/g, '');
  return graph.nodes.find((node) => {
    if (node.type !== 'Team') return false;
    const label = comparable(node.label).replace(/department|team|部门/g, '');
    return label === target || label.includes(target) || target.includes(label);
  });
}

function findPerson(graph: Graph, name?: string) {
  if (!name) return undefined;
  const target = comparable(name);
  return graph.nodes.find(
    (node) =>
      node.type === 'Person' &&
      (comparable(node.label) === target || comparable(node.discordUserId ?? '') === target),
  );
}

function findTask(graph: Graph, title: string) {
  const target = comparable(title);
  return graph.nodes.find(
    (node) => node.type === 'Task' && comparable(node.label) === target,
  );
}

function leastLoadedMember(graph: Graph, teamId: string, added: Map<string, number>) {
  const members = graph.nodes.filter(
    (node) => node.type === 'Person' && node.teamId === teamId,
  );
  return members.sort((a, b) => {
    const workload = (person: GraphNode) =>
      graph.nodes.filter(
        (node) => node.type === 'Task' && node.ownerId === person.id && node.status !== 'done',
      ).length + (added.get(person.id) ?? 0);
    return workload(a) - workload(b) || a.label.localeCompare(b.label);
  })[0];
}

function assignmentFor(
  graph: Graph,
  todo: AnalysedTodo,
  existing: GraphNode | undefined,
  team: GraphNode | undefined,
  added: Map<string, number>,
) {
  if (todo.ownerExplicitlyUnassigned) {
    return { owner: undefined, reason: undefined };
  }
  const explicit = findPerson(graph, todo.assignee);
  if (explicit) return { owner: explicit, reason: 'document_owner' as AssignmentReason };
  const current = existing?.ownerId
    ? graph.nodes.find((node) => node.id === existing.ownerId && node.type === 'Person')
    : undefined;
  if (current) return { owner: current, reason: 'existing_owner' as AssignmentReason };
  const balanced = team ? leastLoadedMember(graph, team.id, added) : undefined;
  return balanced
    ? { owner: balanced, reason: 'department_workload' as AssignmentReason }
    : { owner: undefined, reason: undefined };
}

function buildAssignments(
  graph: Graph,
  tasks: GraphNode[],
  taskReasons: Map<string, AssignmentReason>,
) {
  const dependencies = graph.edges.filter((edge) => edge.type === 'DEPENDS_ON');
  return tasks.map((task): PlanAssignment => {
    const owner = graph.nodes.find((node) => node.id === task.ownerId);
    const department = graph.nodes.find((node) => node.id === task.teamId);
    return {
      taskId: task.id,
      title: task.label,
      ...(task.summary ? { description: task.summary } : {}),
      ...(department ? { departmentId: department.id } : {}),
      department: department?.label ?? 'Unassigned department',
      ...(owner ? { ownerId: owner.id } : {}),
      owner: owner?.label ?? 'Needs confirmation',
      ...(owner?.discordUserId ? { discordUserId: owner.discordUserId } : {}),
      status: task.status ?? 'not_started',
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      dependencyTaskIds: dependencies
        .filter((edge) => edge.from === task.id)
        .map((edge) => edge.to),
      sourceRef: task.sourceRef,
      assignmentReason: taskReasons.get(task.id),
    };
  });
}

export function analysisToPlan(
  graph: Graph,
  analysis: DocumentAnalysis,
  sourceName: string,
): { delta: Delta; plan: DeliveryPlan } {
  const now = new Date().toISOString();
  const sourceRef = (quote: string, itemSource = sourceName): SourceRef => ({
    kind: 'document',
    ref: `import://${itemSource}`,
    quote: quote.slice(0, 300),
  });
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const questions = [...analysis.clarificationQuestions];
  const addedWork = new Map<string, number>();
  const taskReasons = new Map<string, AssignmentReason>();
  const taskByTitle = new Map<string, GraphNode>();
  const deleteEdgeIds: string[] = [];

  for (const department of analysis.departments) {
    const existing = findTeam(graph, department);
    if (existing) continue;
    nodes.push({
      id: `team.${slug(department)}`,
      type: 'Team',
      label: department,
      summary: `${department} was identified from the imported document set.`,
      updatedAt: now,
      sourceRef: sourceRef(`Department identified: ${department}`),
    });
  }

  let rosterGraph: Graph = {
    nodes: [...graph.nodes, ...nodes],
    edges: [...graph.edges],
  };
  for (const person of analysis.people) {
    const existing = findPerson(rosterGraph, person.name);
    const team = findTeam(rosterGraph, person.department);
    if (!team) continue;
    const personNode: GraphNode = existing ?? {
      id: `person.${slug(person.name)}`,
      type: 'Person',
      label: person.name,
      teamId: team.id,
      updatedAt: now,
      sourceRef: sourceRef(`${person.name} — ${person.department}`),
    };
    if (!existing) nodes.push(personNode);
    edges.push({
      id: `${personNode.id}--MEMBER_OF--${team.id}`,
      from: personNode.id,
      to: team.id,
      type: 'MEMBER_OF',
      updatedAt: now,
      sourceRef: sourceRef(`${person.name} — ${person.department}`),
    });
    rosterGraph = {
      nodes: existing ? rosterGraph.nodes : [...rosterGraph.nodes, personNode],
      edges: rosterGraph.edges,
    };
  }

  const meetingTeams = analysis.departments
    .map((name) => findTeam(rosterGraph, name))
    .filter(Boolean) as GraphNode[];

  analysis.todos.slice(0, 200).forEach((todo) => {
    const existing = taskByTitle.get(comparable(todo.title)) ?? findTask(rosterGraph, todo.title);
    const existingTeam = existing?.teamId
      ? rosterGraph.nodes.find((node) => node.id === existing.teamId && node.type === 'Team')
      : undefined;
    const team = existingTeam ?? findTeam(rosterGraph, todo.department) ?? (meetingTeams.length === 1 ? meetingTeams[0] : undefined);
    const assigned = assignmentFor(rosterGraph, todo, existing, team, addedWork);
    if (todo.assignee && !findPerson(rosterGraph, todo.assignee)) {
      questions.push(`成员数据中找不到 ${todo.assignee}；请确认“${todo.title}”由谁负责。`);
    }
    if (!assigned.owner) questions.push(`“${todo.title}”这部分是谁的 work？`);
    if (todo.status !== 'done' && !todo.dueDate && !existing?.dueDate) {
      questions.push(`“${todo.title}”需要在什么时候完成？`);
    }
    if (assigned.owner) addedWork.set(assigned.owner.id, (addedWork.get(assigned.owner.id) ?? 0) + 1);

    const id = existing?.id ?? `task.${slug(todo.title)}`;
    const task: GraphNode = {
      id,
      type: 'Task',
      label: todo.title,
      ...(team?.id || existing?.teamId ? { teamId: team?.id ?? existing?.teamId } : {}),
      status: todo.status ?? existing?.status ?? 'not_started',
      summary: todo.description || existing?.summary || todo.title,
      ...(assigned.owner ? { ownerId: assigned.owner.id } : {}),
      ...(todo.dueDate || existing?.dueDate ? { dueDate: todo.dueDate ?? existing?.dueDate } : {}),
      updatedAt: now,
      sourceRef: sourceRef(todo.quote, todo.sourceName),
    };
    nodes.push(task);
    taskByTitle.set(comparable(todo.title), task);
    if (assigned.reason) taskReasons.set(task.id, assigned.reason);
    if (assigned.owner) {
      if (existing?.ownerId && existing.ownerId !== assigned.owner.id) {
        deleteEdgeIds.push(`${existing.ownerId}--OWNS--${task.id}`);
      }
      edges.push({
        id: `${assigned.owner.id}--OWNS--${task.id}`,
        from: assigned.owner.id,
        to: task.id,
        type: 'OWNS',
        updatedAt: now,
        sourceRef: sourceRef(todo.quote, todo.sourceName),
      });
    }
    if (!team && sourceName.toLowerCase() === 'meeting.md' && meetingTeams.length > 1) {
      questions.push(`会议涉及多个部门；请确认“${todo.title}”属于哪个部门。`);
    }
  });

  for (const todo of analysis.todos) {
    const from = taskByTitle.get(comparable(todo.title)) ?? findTask(rosterGraph, todo.title);
    if (!from) continue;
    for (const dependencyTitle of todo.dependencies) {
      const target = taskByTitle.get(comparable(dependencyTitle)) ?? findTask(rosterGraph, dependencyTitle);
      if (!target) continue;
      edges.push({
        id: `${from.id}--DEPENDS_ON--${target.id}`,
        from: from.id,
        to: target.id,
        type: 'DEPENDS_ON',
        note: `${from.label} depends on ${target.label}.`,
        updatedAt: now,
        sourceRef: from.sourceRef,
      });
    }
  }

  for (const conflict of analysis.conflicts) {
    const left = taskByTitle.get(comparable(conflict.leftTask)) ?? findTask(rosterGraph, conflict.leftTask);
    const right = taskByTitle.get(comparable(conflict.rightTask)) ?? findTask(rosterGraph, conflict.rightTask);
    if (!left || !right || left.id === right.id) continue;
    const [from, to] = [left.id, right.id].sort();
    edges.push({
      id: `${from}--CONFLICTS_WITH--${to}`,
      from,
      to,
      type: 'CONFLICTS_WITH',
      note: conflict.note,
      updatedAt: now,
      sourceRef: sourceRef(conflict.quote, conflict.sourceName),
    });
  }

  if (analysis.todos.length === 0) questions.push('这部分是谁的 work？');
  const uniqueQuestions = [...new Set(questions.map((question) => question.trim()).filter(Boolean))];
  const mergedGraph: Graph = {
    nodes: [
      ...graph.nodes.filter((node) => !nodes.some((next) => next.id === node.id)),
      ...nodes,
    ],
    edges: [
      ...graph.edges.filter((edge) => !edges.some((next) => next.id === edge.id)),
      ...edges,
    ],
  };
  const importedIds = new Set(nodes.filter((node) => node.type === 'Task').map((node) => node.id));
  const plan: DeliveryPlan = {
    id: `plan.${Date.now()}`,
    generatedAt: now,
    sourceName,
    summary: analysis.summary,
    assignments: buildAssignments(
      mergedGraph,
      mergedGraph.nodes.filter(
        (node) => node.type === 'Task' && importedIds.has(node.id) && node.status !== 'done',
      ),
      taskReasons,
    ),
    clarificationQuestions: uniqueQuestions,
    bot: {
      channel: 'discord',
      ready: nodes.length > 0 || uniqueQuestions.length > 0,
      instructions: 'Send one DM per assignment owner, then ask each clarification question in the project channel.',
    },
  };
  return {
    delta: {
      upsertNodes: nodes,
      upsertEdges: edges,
      ...(deleteEdgeIds.length ? { deleteEdgeIds } : {}),
    },
    plan,
  };
}

export function currentPlanFromGraph(graph: Graph): DeliveryPlan {
  const now = new Date().toISOString();
  const tasks = graph.nodes.filter(
    (node) => node.type === 'Task' && node.status !== 'done',
  );
  const reasons = new Map<string, AssignmentReason>();
  for (const task of tasks) {
    if (task.ownerId) reasons.set(task.id, 'existing_owner');
  }
  return {
    id: 'plan.current',
    generatedAt: now,
    sourceName: 'existing dataset',
    summary: 'Current open work derived from the shared Athena project dataset.',
    assignments: buildAssignments(graph, tasks, reasons),
    clarificationQuestions: [...new Set(tasks.flatMap((task) => [
      ...(!task.ownerId || !task.teamId ? [`“${task.label}”这部分是谁的 work？`] : []),
      ...(!task.dueDate ? [`“${task.label}”需要在什么时候完成？`] : []),
    ]))],
    bot: {
      channel: 'discord',
      ready: tasks.length > 0,
      instructions: 'Send one DM per assignment owner, then ask each clarification question in the project channel.',
    },
  };
}

/** Backfill required questions for plans saved before the current planning rules. */
export function ensurePlanClarifications(plan: DeliveryPlan): DeliveryPlan {
  const assignments = plan.assignments.filter((assignment) => assignment.status !== 'done');
  const generated = assignments.flatMap((assignment) => [
    ...(!assignment.ownerId ? [`“${assignment.title}”这部分是谁的 work？`] : []),
    ...(assignment.status !== 'done' && !assignment.dueDate
      ? [`“${assignment.title}”需要在什么时候完成？`]
      : []),
  ]);
  return {
    ...plan,
    assignments,
    clarificationQuestions: [...new Set([
      ...plan.clarificationQuestions,
      ...generated,
    ].map((question) => question.trim()).filter(Boolean))],
  };
}
