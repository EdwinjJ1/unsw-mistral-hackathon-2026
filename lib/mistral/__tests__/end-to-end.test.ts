import { beforeEach, describe, expect, it } from "vitest";

import {
  extractDelta,
  findContradictions,
  triageReply,
} from "../index.js";
import {
  applyDeltaForTest,
  demoReply,
  demoSource,
  makeDemoGraph,
} from "./fixtures.js";

describe("required forced-fallback demo flow", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
  });

  it("triages, applies the demo delta, and surfaces the Legal conflict", async () => {
    const graph = makeDemoGraph();
    expect(await triageReply(demoReply)).toBe("blocker");

    const delta = await extractDelta(demoReply, graph, demoSource);
    const updated = applyDeltaForTest(graph, delta);
    const changedIds = [
      ...(delta.upsertNodes ?? []).map((node) => node.id),
      ...(delta.upsertEdges ?? []).map((edge) => edge.id),
    ];
    const conflicts = await findContradictions(updated, changedIds);

    expect(updated.nodes.find((node) => node.id === "task.rollback-runbook")?.status).toBe(
      "done",
    );
    expect(updated.nodes.some((node) => node.id === "blocker.waiting-on-legal")).toBe(true);
    expect(conflicts.map((edge) => edge.id)).toEqual([
      "blocker.waiting-on-legal--CONFLICTS_WITH--decision.legal-approvals-cleared",
    ]);
  });
});
