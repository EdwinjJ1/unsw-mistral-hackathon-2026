import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractDelta } from "../extract-delta";
import { setStructuredTransportForTests } from "../structured";
import { demoReply, demoSource, makeDemoGraph } from "./fixtures";

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

  it("anchors a model blocker to the task explicitly named in the reply", async () => {
    const graph = makeDemoGraph();
    graph.nodes.push({
      id: "task.production-deploy",
      type: "Task",
      label: "Production deployment",
      status: "in_progress",
      updatedAt: "2026-07-31T00:00:00.000Z",
    });
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    setStructuredTransportForTests(async () =>
      JSON.stringify({
        nodes: [
          {
            id: "task.rollback-runbook",
            type: "Task",
            label: "Rollback runbook",
            status: "done",
          },
          {
            id: "tmp-blocker",
            type: "Blocker",
            label: "Waiting on Legal",
            status: "blocked",
          },
        ],
        edges: [
          {
            from: "tmp-blocker",
            to: "task.production-deploy",
            type: "BLOCKS",
          },
          {
            from: "person.engineer",
            to: "tmp-blocker",
            type: "OWNS",
          },
        ],
      }),
    );

    const delta = await extractDelta(demoReply, graph, demoSource);
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
        }),
      ]),
    );
    expect(delta.upsertEdges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "OWNS", to: "blocker.waiting-on-legal" }),
      ]),
    );
  });

  it("preserves deterministic supported facts when the model omits the blocker", async () => {
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    setStructuredTransportForTests(async () =>
      JSON.stringify({
        nodes: [
          {
            id: "decision.legal-approvals-cleared",
            type: "Decision",
            label: "Legal approvals cleared",
            status: "done",
          },
        ],
        edges: [
          {
            from: "task.rollback-runbook",
            to: "decision.legal-approvals-cleared",
            type: "DEPENDS_ON",
          },
        ],
      }),
    );

    const delta = await extractDelta(demoReply, makeDemoGraph(), demoSource);
    expect(delta.upsertNodes?.map((node) => node.id)).toEqual([
      "task.rollback-runbook",
      "blocker.waiting-on-legal",
    ]);
    expect(delta.upsertEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "blocker.waiting-on-legal--BLOCKS--task.rollback-runbook",
        }),
        expect.objectContaining({
          id: "task.rollback-runbook--DEPENDS_ON--team.legal",
        }),
      ]),
    );
  });
});
