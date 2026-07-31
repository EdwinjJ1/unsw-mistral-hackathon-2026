import type { Graph, GraphNode } from "../types";
import { deriveAssignments, type AssignmentFact } from "./graph-context";
import { composeDmSchema } from "./schemas";
import { requestStructured } from "./structured";

function lowerInitial(value: string): string {
  return value ? value[0]!.toLowerCase() + value.slice(1) : value;
}

function displayTaskName(value: string): string {
  return lowerInitial(
    value.replace(
      /^(?:write|prepare|publish|approve|complete|finalise|finalize|ship|refresh|draft|verify)\s+/i,
      "",
    ),
  );
}

function fallbackCompose(person: GraphNode, facts: AssignmentFact[]): string {
  const fact = facts[0];
  if (!fact) {
    return `Hi ${person.label} — do you have any new progress, blockers, or decisions Athena should record?`;
  }

  const taskName = displayTaskName(fact.task.label);
  if (fact.task.status === "done" && fact.blockers.length > 0) {
    const blocker = lowerInitial(fact.blockers[0]!.label);
    return `The ${taskName} is marked done, but ${blocker} is still unresolved. Please reply with what is needed to clear it.`;
  }

  const due = fact.task.dueDate ? `, due ${fact.task.dueDate}` : "";
  const dependency = fact.dependencies[0];
  let dependencySentence = "";
  if (dependency) {
    const contact = dependency.contact?.label ?? dependency.target.label;
    const action = dependency.instruction
      ? lowerInitial(dependency.instruction.replace(/[.!]+$/g, ""))
      : "confirm the dependency";
    dependencySentence = ` Please ${action} with ${contact}.`;
  } else if (fact.blockers[0]) {
    dependencySentence = ` Please address ${lowerInitial(fact.blockers[0].label)}.`;
  }

  return `You own the ${taskName}${due}.${dependencySentence} Reply with your progress and any blockers.`.replace(
    /\.\s+\./g,
    ".",
  );
}

function compactFacts(person: GraphNode, facts: AssignmentFact[]): object {
  return {
    person: { id: person.id, label: person.label },
    assignments: facts.slice(0, 5).map((fact) => ({
      task: {
        id: fact.task.id,
        label: fact.task.label,
        ...(fact.task.status ? { status: fact.task.status } : {}),
        ...(fact.task.dueDate ? { dueDate: fact.task.dueDate } : {}),
      },
      blockers: fact.blockers.map((blocker) => ({
        id: blocker.id,
        label: blocker.label,
      })),
      dependencies: fact.dependencies.map((dependency) => ({
        target: {
          id: dependency.target.id,
          label: dependency.target.label,
          type: dependency.target.type,
        },
        ...(dependency.contact
          ? {
              contact: {
                id: dependency.contact.id,
                label: dependency.contact.label,
              },
            }
          : {}),
        ...(dependency.instruction
          ? { instruction: dependency.instruction.slice(0, 180) }
          : {}),
      })),
    })),
  };
}

function groundedMessage(message: string, facts: AssignmentFact[]): boolean {
  if (/@[\w.-]+/.test(message)) return false;
  const fact = facts[0];
  if (!fact) return true;

  const lower = message.toLowerCase();
  if (!lower.includes(fact.task.label.toLowerCase())) return false;
  if (fact.task.dueDate && !message.includes(fact.task.dueDate)) return false;

  const dependency = fact.dependencies[0];
  if (dependency) {
    const contact = dependency.contact?.label ?? dependency.target.label;
    if (!lower.includes(contact.toLowerCase())) return false;
  }
  return true;
}

export async function composeDM(
  person: GraphNode,
  subgraph: Graph,
): Promise<string> {
  const facts = deriveAssignments(person, subgraph);
  const localFallback = (): string => fallbackCompose(person, facts);
  const result = await requestStructured({
    model: process.env.MISTRAL_LARGE_MODEL || "mistral-large-latest",
    system:
      "Write one concise Discord DM using only the supplied assignment facts. Mention the task, known ISO deadline, dependency contact or confirmation, and ask for progress or blockers; never invent handles.",
    user: JSON.stringify(compactFacts(person, facts)),
    schemaName: "compose_dm",
    schema: composeDmSchema,
    fallback: () => ({ message: localFallback() }),
  });

  return groundedMessage(result.message, facts) ? result.message : localFallback();
}
