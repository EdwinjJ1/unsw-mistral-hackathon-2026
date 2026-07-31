import { describe, expect, it } from "vitest";

import type { Graph, SourceRef } from "../../types";
import { normalizeDeltaDraft } from "../normalize";

const source: SourceRef = { kind: "document", ref: "document:test" };

describe("server-owned normalization", () => {
  it("validates dates, deduplicates, preserves fields, and preserves inputs", () => {
    const context: Graph = {
      nodes: [
        {
          id: "task.existing-special-id",
          type: "Task",
          label: "Existing Task",
          dueDate: "2026-08-01",
          summary: "Original summary.",
          updatedAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      edges: [],
    };
    const snapshot = structuredClone(context);
    const inputText = "Exact evidence sentence.";
    const result = normalizeDeltaDraft(
      {
        nodes: [
          {
            id: "task.existing-special-id",
            type: "Task",
            label: "Existing Task",
            dueDate: "2026-02-30",
            summary: "First sentence. Second sentence! Third sentence must be removed.",
            evidenceQuote: "not in source",
          },
          {
            type: "Task",
            label: "Existing Task",
            status: "done",
            evidenceQuote: inputText,
          },
        ],
        edges: [],
      },
      { context, source, inputText },
    );

    expect(result.upsertNodes).toHaveLength(1);
    expect(result.upsertNodes?.[0]).toMatchObject({
      id: "task.existing-special-id",
      dueDate: "2026-08-01",
      status: "done",
      summary: "First sentence. Second sentence!",
    });
    expect(result.upsertNodes?.[0]?.sourceRef).toEqual({
      ...source,
      quote: inputText,
    });
    expect(context).toEqual(snapshot);
  });

  it("canonicalizes conflict IDs and bounds notes to one line", () => {
    const context: Graph = {
      nodes: [
        { id: "task.z", type: "Task", label: "Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "decision.a", type: "Decision", label: "A", updatedAt: "2026-01-01T00:00:00Z" },
      ],
      edges: [],
    };
    const result = normalizeDeltaDraft(
      {
        nodes: [],
        edges: [
          {
            from: "task.z",
            to: "decision.a",
            type: "CONFLICTS_WITH",
            note: `Line one\n${"x".repeat(400)}`,
          },
        ],
      },
      { context, source },
    );
    const edge = result.upsertEdges?.[0];
    expect(edge).toMatchObject({
      id: "decision.a--CONFLICTS_WITH--task.z",
      from: "decision.a",
      to: "task.z",
    });
    expect(edge?.note).not.toMatch(/[\r\n]/);
    expect(edge?.note?.length).toBeLessThanOrEqual(240);
  });

  it("rejects semantically invalid edge endpoint types", () => {
    const context: Graph = {
      nodes: [
        { id: "person.alice", type: "Person", label: "Alice", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "task.release", type: "Task", label: "Release", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "blocker.legal", type: "Blocker", label: "Legal", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "team.legal", type: "Team", label: "Legal", updatedAt: "2026-01-01T00:00:00Z" },
      ],
      edges: [],
    };
    const result = normalizeDeltaDraft(
      {
        nodes: [],
        edges: [
          { from: "person.alice", to: "blocker.legal", type: "OWNS" },
          { from: "blocker.legal", to: "team.legal", type: "BLOCKS" },
          { from: "person.alice", to: "task.release", type: "OWNS" },
          { from: "blocker.legal", to: "task.release", type: "BLOCKS" },
        ],
      },
      { context, source },
    );

    expect(result.upsertEdges?.map((edge) => edge.id)).toEqual([
      "person.alice--OWNS--task.release",
      "blocker.legal--BLOCKS--task.release",
    ]);
  });
});
