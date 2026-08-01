import { ValidationError } from './validation';

export type TaskState = 'Active' | 'Review' | 'Blocked';

export interface TaskAction {
  taskKey: string;
  title: string;
  owner: string;
  team: string;
  due: string;
  progress: number;
  state: TaskState;
}

const TASK_STATES = new Set<TaskState>(['Active', 'Review', 'Blocked']);

function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const field = value[key];
  if (typeof field !== 'string' || field.trim() === '') {
    throw new ValidationError(`${key} must be a non-empty string`);
  }
  const normalized = field.trim();
  if (normalized.length > maxLength) {
    throw new ValidationError(`${key} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

export function parseTaskAction(value: unknown): TaskAction {
  const input = record(value, 'request body');
  const progress = input.progress;
  if (!Number.isInteger(progress) || (progress as number) < 0 || (progress as number) > 100) {
    throw new ValidationError('progress must be an integer from 0 to 100');
  }

  const state = stringField(input, 'state', 16);
  if (!TASK_STATES.has(state as TaskState)) {
    throw new ValidationError('state must be Active, Review, or Blocked');
  }

  return {
    taskKey: stringField(input, 'taskKey', 120),
    title: stringField(input, 'title', 180),
    owner: stringField(input, 'owner', 100),
    team: stringField(input, 'team', 100),
    due: stringField(input, 'due', 80),
    progress: progress as number,
    state: state as TaskState,
  };
}

export function parseReminderRequest(value: unknown): {
  task: TaskAction;
  remindAt: string;
} {
  const input = record(value, 'request body');
  const remindAt = stringField(input, 'remindAt', 64);
  const timestamp = Date.parse(remindAt);
  const now = Date.now();
  if (!Number.isFinite(timestamp)) {
    throw new ValidationError('remindAt must be a valid ISO timestamp');
  }
  if (timestamp < now + 5_000) {
    throw new ValidationError('remindAt must be at least 5 seconds in the future');
  }
  if (timestamp > now + 30 * 24 * 60 * 60 * 1000) {
    throw new ValidationError('remindAt must be within 30 days');
  }

  return {
    task: parseTaskAction(input.task),
    remindAt: new Date(timestamp).toISOString(),
  };
}

function clipped(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function formatDiscordTask(task: TaskAction, reminder = false): string {
  const heading = reminder ? 'ATHENA · TASK REMINDER' : 'ATHENA · TASK PUSH';
  const content = [
    `**${heading}**`,
    `**${clipped(task.title, 180)}**`,
    `${clipped(task.team, 100)} · Owner: ${clipped(task.owner, 100)}`,
    `Due: ${clipped(task.due, 80)} · Progress: ${task.progress}% · ${task.state}`,
  ].join('\n');
  return clipped(content, 2_000);
}
