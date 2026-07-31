import { createHash } from "node:crypto";

import { nodeId, type Delta, type EdgeType, type SourceRef } from "../types";
import type { DeltaDraft, DeltaEdgeDraft, DeltaNodeDraft } from "./models";
import { normalizeDeltaDraft } from "./normalize";
import { deltaDraftSchema } from "./schemas";
import { requestStructured } from "./structured";

const INGEST_EDGE_TYPES = new Set<EdgeType>([
  "MEMBER_OF",
  "OWNS",
  "DEPENDS_ON",
  "BLOCKS",
]);

function normalizedDocument(text: string): string {
  return text.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
}

function documentSource(text: string): SourceRef {
  const digest = createHash("sha256")
    .update(normalizedDocument(text), "utf8")
    .digest("hex")
    .slice(0, 16);
  return { kind: "document", ref: `document:${digest}` };
}

function recognizedTeamHeading(line: string): string | undefined {
  const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
  if (!match) return undefined;
  const raw = match[1]!.replace(/\s+team$/i, "").trim();
  return /\b(engineering|legal|ops|operations|product|design|marketing|sales|finance|security|data)\b/i.test(
    raw,
  ) || /\bteam\b/i.test(match[1]!)
    ? raw
    : undefined;
}

function cleanFactLabel(line: string, prefix: RegExp): string {
  return line
    .replace(/^\s*[-*]\s*/, "")
    .replace(prefix, "")
    .replace(/\s*\((?:owner|due|depends on):[^)]*\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[.;]+$/g, "")
    .trim();
}

function fallbackDocumentDraft(text: string): DeltaDraft {
  const nodes = new Map<string, DeltaNodeDraft>();
  const edges = new Map<string, DeltaEdgeDraft>();
  let currentTeamId: string | undefined;
  let lastTaskId: string | undefined;

  const addNode = (draft: DeltaNodeDraft): string => {
    const id = draft.id ?? nodeId(draft.type, draft.label);
    nodes.set(id, { ...nodes.get(id), ...draft, id });
    return id;
  };
  const addEdge = (draft: DeltaEdgeDraft): void => {
    edges.set(`${draft.from}--${draft.type}--${draft.to}`, draft);
  };
  const addPerson = (label: string, quote: string): string => {
    const personId = addNode({
      type: "Person",
      label: label.trim(),
      ...(currentTeamId ? { teamId: currentTeamId } : {}),
      evidenceQuote: quote,
    });
    if (currentTeamId) {
      addEdge({
        from: personId,
        to: currentTeamId,
        type: "MEMBER_OF",
        evidenceQuote: quote,
      });
    }
    return personId;
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const teamLabel = recognizedTeamHeading(line);
    if (teamLabel) {
      currentTeamId = addNode({
        type: "Team",
        label: teamLabel,
        evidenceQuote: line,
      });
      lastTaskId = undefined;
      continue;
    }

    const checklist = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(rawLine);
    const taskPrefix = /^\s*(?:[-*]\s*)?task\s*:\s*(.+)$/i.exec(rawLine);
    if (checklist || taskPrefix) {
      const body = checklist?.[2] ?? taskPrefix?.[1] ?? "";
      const owner = /\bowner\s*:\s*([^,;)]+)/i.exec(body)?.[1]?.trim();
      const dueDate = /\bdue(?:\s+date)?\s*:\s*(\d{4}-\d{2}-\d{2})/i.exec(body)?.[1];
      const dependency = /\bdepends\s+on\s+([^,;).]+)/i.exec(body)?.[1]?.trim();
      const label = body
        .replace(/\s*\((?:owner|due|due date|depends on):[^)]*\)/gi, "")
        .replace(/[,;]?\s*owner\s*:\s*[^,;)]+/gi, "")
        .replace(/[,;]?\s*due(?:\s+date)?\s*:\s*\d{4}-\d{2}-\d{2}/gi, "")
        .replace(/[,;]?\s*depends\s+on\s+[^,;).]+/gi, "")
        .replace(/[.;]+$/g, "")
        .trim();
      if (!label) continue;

      lastTaskId = addNode({
        type: "Task",
        label,
        ...(currentTeamId ? { teamId: currentTeamId } : {}),
        ...(checklist ? { status: checklist[1]!.toLowerCase() === "x" ? "done" : "not_started" } : {}),
        ...(dueDate ? { dueDate } : {}),
        evidenceQuote: line,
      });
      if (owner) {
        const personId = addPerson(owner, line);
        addEdge({ from: personId, to: lastTaskId, type: "OWNS", evidenceQuote: line });
        const task = nodes.get(lastTaskId)!;
        nodes.set(lastTaskId, { ...task, ownerId: personId });
      }
      if (dependency) {
        const dependencyId = addNode({
          type: "Team",
          label: dependency,
          evidenceQuote: line,
        });
        addEdge({
          from: lastTaskId,
          to: dependencyId,
          type: "DEPENDS_ON",
          evidenceQuote: line,
        });
      }
      continue;
    }

    const ownerLine = /^\s*(?:[-*]\s*)?owner\s*:\s*(.+?)\s*$/i.exec(rawLine);
    if (ownerLine) {
      const personId = addPerson(ownerLine[1]!.trim(), line);
      if (lastTaskId) {
        addEdge({ from: personId, to: lastTaskId, type: "OWNS", evidenceQuote: line });
        const task = nodes.get(lastTaskId)!;
        nodes.set(lastTaskId, { ...task, ownerId: personId });
      }
      continue;
    }

    if (/\b(approved|decided|decision)\b/i.test(line)) {
      const label = cleanFactLabel(line, /^(?:decision\s*:\s*)/i);
      if (label) {
        addNode({
          type: "Decision",
          label,
          ...(currentTeamId ? { teamId: currentTeamId } : {}),
          status: "done",
          summary: label,
          evidenceQuote: line,
        });
      }
      continue;
    }

    if (/\b(blocked|waiting|pending)\b/i.test(line)) {
      const label = cleanFactLabel(line, /^(?:blocked|blocker)\s*:\s*/i);
      if (label) {
        const blockerId = addNode({
          type: "Blocker",
          label,
          ...(currentTeamId ? { teamId: currentTeamId } : {}),
          status: "blocked",
          summary: label,
          evidenceQuote: line,
        });
        if (lastTaskId) {
          addEdge({
            from: blockerId,
            to: lastTaskId,
            type: "BLOCKS",
            evidenceQuote: line,
          });
        }
      }
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export async function generateGraphFromText(text: string): Promise<Delta> {
  if (!text.trim()) return {};

  const source = documentSource(text);
  const draft = await requestStructured({
    model: process.env.MISTRAL_LARGE_MODEL || "mistral-large-latest",
    system:
      "Extract only explicit teams, people, tasks, decisions, blockers, and MEMBER_OF, OWNS, DEPENDS_ON, or BLOCKS relationships. Include exact source substrings as evidence, invent nothing, and never create conflicts or deletions.",
    user: text.slice(0, 30_000),
    schemaName: "generate_graph_from_text",
    schema: deltaDraftSchema,
    fallback: () => fallbackDocumentDraft(text),
  });

  return normalizeDeltaDraft(draft, {
    source,
    inputText: text,
    allowedEdgeTypes: INGEST_EDGE_TYPES,
  });
}
