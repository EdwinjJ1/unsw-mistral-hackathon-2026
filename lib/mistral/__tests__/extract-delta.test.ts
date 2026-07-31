import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractDelta } from "../extract-delta.js";
import { setStructuredTransportForTests } from "../structured.js";
import { demoReply, demoSource, makeDemoGraph } from "./fixtures.js";

describe("extractDelta", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
    setStructuredTransportForTests(undefined);
  });

  afterEach(() => {
    setStructuredTransportForTests(undefined);
    delete process.env.MISTRAL_API_KEY;
  });

  it("implements the deterministic demo delta without mutating inputs", async () => {
    const graph = makeDemoGraph();
    const originalGraph = structuredClone(graph);
    const originalSource = structuredClone(demoSource);
    const delta = await extractDelta(demoReply, graph, demoSource);

    const task = delta.upsertNodes?.find(
      (node) => node.id === "task.rollback-runbook",
    );
    const blocker = delta.upsertNodes?.find(
      (node) => node.id === "blocker.waiting-on-legal",
    );
    expect(task).toMatchObject({
      id: "task.rollback-runbook",
      status: "done",
      dueDate: "2026-08-01",
      summary: "Prepare the rollback runbook for launch.",
    });
    expect(blocker).toMatchObject({
      type: "Blocker",
      label: "Waiting on Legal",
      status: "blocked",
      teamId: "team.engineering",
    });
    expect(delta.upsertEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "blocker.waiting-on-legal--BLOCKS--task.rollback-runbook",
          from: "blocker.waiting-on-legal",
          to: "task.rollback-runbook",
          type: "BLOCKS",
        }),
        expect.objectContaining({
          id: "task.rollback-runbook--DEPENDS_ON--team.legal",
          type: "DEPENDS_ON",
        }),
      ]),
    );
    expect(delta).not.toHaveProperty("deleteNodeIds");
    expect(delta).not.toHaveProperty("deleteEdgeIds");
    for (const change of [
      ...(delta.upsertNodes ?? []),
      ...(delta.upsertEdges ?? []),
    ]) {
      expect(change.sourceRef).toEqual(demoSource);
      expect(change.sourceRef).not.toBe(demoSource);
    }
    expect(graph).toEqual(originalGraph);
    expect(demoSource).toEqual(originalSource);
  });

  it("produces the same IDs on repeated processing", async () => {
    const graph = makeDemoGraph();
    const first = await extractDelta(demoReply, graph, demoSource);
    const second = await extractDelta(demoReply, graph, demoSource);
    expect(first.upsertNodes?.map((node) => node.id)).toEqual(
      second.upsertNodes?.map((node) => node.id),
    );
    expect(first.upsertEdges?.map((edge) => edge.id)).toEqual(
      second.upsertEdges?.map((edge) => edge.id),
    );
  });

  it("drops a model edge with unknown endpoints", async () => {
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    const transport = vi.fn(async () =>
      JSON.stringify({
        nodes: [],
        edges: [{ from: "missing.a", to: "missing.b", type: "BLOCKS" }],
      }),
    );
    setStructuredTransportForTests(transport);

    const delta = await extractDelta("Explicit update", makeDemoGraph(), demoSource);
    expect(delta).toEqual({});
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("resolves model-local references and generates IDs in code", async () => {
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    setStructuredTransportForTests(async () =>
      JSON.stringify({
        nodes: [
          { id: "tmp-1", type: "Blocker", label: "Vendor outage", status: "blocked" },
        ],
        edges: [{ from: "tmp-1", to: "task.rollback-runbook", type: "BLOCKS" }],
      }),
    );

    const delta = await extractDelta("Vendor outage blocks runbook", makeDemoGraph(), demoSource);
    expect(delta.upsertNodes?.[0]?.id).toBe("blocker.vendor-outage");
    expect(delta.upsertEdges?.[0]?.id).toBe(
      "blocker.vendor-outage--BLOCKS--task.rollback-runbook",
    );
  });
});
