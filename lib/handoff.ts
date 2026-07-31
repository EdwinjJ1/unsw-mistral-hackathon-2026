import type {
  DeliveryPlan,
  Graph,
  PlanAssignment,
  PlanDispatchReceipt,
  PlanHandoff,
  PlanHandoffManifest,
} from './types';

function formatAssignment(item: PlanAssignment, titleById: Map<string, string>): string {
  const dependencies = item.dependencyTaskIds
    .map((id) => titleById.get(id) ?? id)
    .join(', ');
  return [
    `• ${item.title}`,
    `  Department: ${item.department}`,
    `  When: ${item.dueDate ?? 'needs confirmation'}`,
    `  Status: ${item.status.replaceAll('_', ' ')}`,
    ...(dependencies ? [`  Depends on: ${dependencies}`] : []),
    ...(item.description ? [`  Detail: ${item.description}`] : []),
  ].join('\n');
}

export function formatHandoffMessage(
  plan: DeliveryPlan,
  owner: string,
  assignments: PlanAssignment[],
): string {
  const titleById = new Map(plan.assignments.map((item) => [item.taskId, item.title]));
  return [
    `Hi ${owner} — Athena prepared your delivery handoff from “${plan.sourceName}”.`,
    '',
    ...assignments.flatMap((item) => [formatAssignment(item, titleById), '']),
    'Reply with DONE: <task>, BLOCKED: <task + reason>, or ETA: <task + date>.',
  ].join('\n').trim();
}

export function buildHandoffManifest(
  plan: DeliveryPlan,
  graph: Graph,
  receipts: PlanDispatchReceipt[],
): PlanHandoffManifest {
  const personById = new Map(
    graph.nodes.filter((node) => node.type === 'Person').map((node) => [node.id, node]),
  );
  const receiptByOwner = new Map(receipts.map((receipt) => [receipt.ownerKey, receipt]));
  const groups = new Map<string, PlanAssignment[]>();

  for (const assignment of plan.assignments) {
    const ownerKey = assignment.ownerId ?? `unassigned:${assignment.departmentId ?? assignment.department}`;
    groups.set(ownerKey, [...(groups.get(ownerKey) ?? []), assignment]);
  }

  const handoffs: PlanHandoff[] = [...groups.entries()].map(([ownerKey, assignments]) => {
    const first = assignments[0];
    const person = first.ownerId ? personById.get(first.ownerId) : undefined;
    const receipt = receiptByOwner.get(ownerKey);
    const discordUserId = person?.discordUserId ?? first.discordUserId ?? receipt?.discordUserId;
    const owner = person?.label ?? first.owner;
    return {
      ownerKey,
      ...(first.ownerId ? { ownerId: first.ownerId } : {}),
      owner,
      department: first.department,
      ...(discordUserId ? { discordUserId } : {}),
      assignments: assignments.map((assignment) => ({
        ...assignment,
        owner,
        ...(discordUserId ? { discordUserId } : {}),
      })),
      message: formatHandoffMessage(plan, owner, assignments),
      status: receipt?.status ?? 'pending',
      ...(receipt?.messageId ? { messageId: receipt.messageId } : {}),
      ...(receipt?.detail ? { detail: receipt.detail } : {}),
    };
  });

  return {
    planId: plan.id,
    generatedAt: plan.generatedAt,
    sourceName: plan.sourceName,
    summary: plan.summary,
    handoffs,
    clarificationQuestions: plan.clarificationQuestions,
    counts: {
      assignments: plan.assignments.length,
      recipients: handoffs.filter((item) => item.ownerId).length,
      ready: handoffs.filter((item) => item.discordUserId && item.status === 'pending').length,
      missingIdentity: handoffs.filter((item) => item.ownerId && !item.discordUserId).length,
      unassigned: handoffs.filter((item) => !item.ownerId).length,
      sent: handoffs.filter((item) => item.status === 'sent').length,
      failed: handoffs.filter((item) => item.status === 'failed').length,
    },
  };
}
