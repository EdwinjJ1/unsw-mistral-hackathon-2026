import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Graph } from "../../types";
import { extractDelta } from "../extract-delta";
import { findContradictions } from "../find-contradictions";
import { setStructuredTransportForTests } from "../structured";
import {
  demoReply,
  demoSource,
  makeDemoGraph,
  mergeDeltaForUnitTest,
} from "./fixtures";

async function updatedDemoGraph(): Promise<{ graph: Graph; changedIds: string[] }> {
  const base = makeDemoGraph();
  const delta = await extractDelta(demoReply, base, demoSource);
  return {
    graph: mergeDeltaForUnitTest(base, delta),
    changedIds: [
      ...(delta.upsertNodes ?? []).map((node) => node.id),
      ...(delta.upsertEdges ?? []).map((edge) => edge.id),
    ],
  };
}

describe("findContradictions", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
    setStructuredTransportForTests(undefined);
  });

  afterEach(() => {
    setStructuredTransportForTests(undefined);
    delete process.env.MISTRAL_API_KEY;
  });

  it("finds exactly one canonical Legal demo conflict", async () => {
    const { graph, changedIds } = await updatedDemoGraph();
    const snapshot = structuredClone(graph);
    const conflicts = await findContradictions(graph, changedIds);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      id: "blocker.waiting-on-legal--CONFLICTS_WITH--decision.legal-approvals-cleared",
      from: "blocker.waiting-on-legal",
      to: "decision.legal-approvals-cleared",
      type: "CONFLICTS_WITH",
    });
    expect(conflicts[0]?.note).not.toMatch(/[\r\n]/);
    expect(graph).toEqual(snapshot);
  });

  it("does not turn an ordinary dependency into a contradiction", async () => {
    const graph = makeDemoGraph();
    expect(await findContradictions(graph, ["task.rollback-runbook"])).toEqual([]);
  });

  it("rejects self, unknown, unrelated, and symmetric duplicate model pairs", async () => {
    const { graph, changedIds } = await updatedDemoGraph();
    graph.nodes.push({
      id: "decision.legal-review-scheduled",
      type: "Decision",
      label: "Legal review scheduled",
      teamId: "team.legal",
      updatedAt: "2026-07-31T00:00:00.000Z",
    });
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    setStructuredTransportForTests(async () =>
      JSON.stringify({
        conflicts: [
          { from: "blocker.waiting-on-legal", to: "blocker.waiting-on-legal", note: "self" },
          { from: "missing", to: "decision.legal-approvals-cleared", note: "unknown" },
          {
            from: "decision.legal-review-scheduled",
            to: "decision.legal-approvals-cleared",
            note: "neither endpoint is changed or directly related",
          },
          {
            from: "decision.legal-approvals-cleared",
            to: "blocker.waiting-on-legal",
            note: "First line\nsecond line",
          },
          {
            from: "blocker.waiting-on-legal",
            to: "decision.legal-approvals-cleared",
            note: "Canonical duplicate",
          },
        ],
      }),
    );

    const conflicts = await findContradictions(graph, changedIds);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.from).toBe("blocker.waiting-on-legal");
    expect(conflicts[0]?.to).toBe("decision.legal-approvals-cleared");
    expect(conflicts[0]?.note).not.toMatch(/[\r\n]/);
  });

  it("deduplicates a conflict already present in either direction", async () => {
    const { graph, changedIds } = await updatedDemoGraph();
    graph.edges.push({
      id: "legacy-reversed-id",
      from: "decision.legal-approvals-cleared",
      to: "blocker.waiting-on-legal",
      type: "CONFLICTS_WITH",
      note: "Already known",
      updatedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(await findContradictions(graph, changedIds)).toEqual([]);
  });
});
