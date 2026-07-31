import { beforeEach, describe, expect, it } from "vitest";

import type { Graph, GraphNode } from "../../types.js";
import { composeDM } from "../compose-dm.js";
import { demoPerson, makeDemoGraph } from "./fixtures.js";

describe("composeDM fallback", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
  });

  it("includes the owned task, deadline, and dependency contact", async () => {
    const graph = makeDemoGraph();
    const snapshot = structuredClone(graph);
    const message = await composeDM(demoPerson(graph), graph);

    expect(message).toBe(
      "You own the rollback runbook, due 2026-08-01. Please confirm the retention window with Legal. Reply with your progress and any blockers.",
    );
    expect(message).not.toContain("@");
    expect(message).not.toContain("Publish old notes");
    expect(graph).toEqual(snapshot);
  });

  it("uses a useful prompt when the person has no assignments", async () => {
    const person: GraphNode = {
      id: "person.bob",
      type: "Person",
      label: "Bob",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const graph: Graph = { nodes: [person], edges: [] };
    expect(await composeDM(person, graph)).toBe(
      "Hi Bob — do you have any new progress, blockers, or decisions Athena should record?",
    );
  });

  it("does not ask someone to complete a done task with no blocker", async () => {
    const graph = makeDemoGraph();
    graph.nodes = graph.nodes.map((node) =>
      node.id === "task.rollback-runbook" ? { ...node, status: "done" } : node,
    );
    const message = await composeDM(demoPerson(graph), graph);
    expect(message).toContain("do you have any new progress");
    expect(message).not.toContain("rollback runbook");
  });
});
