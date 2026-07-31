import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, resetDb } from "../../db";
import { applyDelta, getGraph, getPersonSubgraph } from "../../graph";
import { parseGraph } from "../../validation";
import { POST as ingestDocument } from "../../../app/api/ingest/route";
import {
  composeDM,
  extractDelta,
  findContradictions,
  triageReply,
} from "../index";
import {
  demoReply,
  demoSource,
  makeDemoGraph,
} from "./fixtures";

let testDirectory = "";

beforeEach(() => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "athena-mistral-e2e-"));
  process.env.DATABASE_PATH = path.join(testDirectory, "test.db");
  process.env.MISTRAL_FORCE_FALLBACK = "1";
  resetDb();
});

afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  delete process.env.MISTRAL_FORCE_FALLBACK;
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe("required forced-fallback demo flow", () => {
  it("wires Track A ingest to Track E and accepts a safe empty delta", async () => {
    const response = await ingestDocument(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hello and thanks for reading." }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(getGraph()).toEqual({ nodes: [], edges: [] });
  });

  it("uses Track A applyDelta and surfaces the canonical Legal conflict", async () => {
    const initial = makeDemoGraph();
    applyDelta({ upsertNodes: initial.nodes, upsertEdges: initial.edges });
    expect(await triageReply(demoReply)).toBe("blocker");

    const delta = await extractDelta(demoReply, getGraph(), demoSource);
    const { changed } = applyDelta(delta);
    const conflicts = await findContradictions(getGraph(), changed);
    applyDelta({ upsertEdges: conflicts });

    const updated = getGraph();
    expect(updated.nodes.find((node) => node.id === "task.rollback-runbook")?.status).toBe(
      "done",
    );
    expect(updated.nodes.some((node) => node.id === "blocker.waiting-on-legal")).toBe(true);
    expect(conflicts.map((edge) => edge.id)).toEqual([
      "blocker.waiting-on-legal--CONFLICTS_WITH--decision.legal-approvals-cleared",
    ]);
  });

  it("runs the same flow against the merged Track F seed", async () => {
    const seed = parseGraph(
      JSON.parse(
        fs.readFileSync(
          new URL("../../../data/seed.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    applyDelta({ upsertNodes: seed.nodes, upsertEdges: seed.edges });

    const alexGraph = getPersonSubgraph("100000000000000002");
    const alex = alexGraph.nodes.find((node) => node.id === "person.alex-ng")!;
    expect(await composeDM(alex, alexGraph)).toBe(
      "You own the rollback runbook, due 2026-08-01. Please confirm the retention window with Jordan Kim. Reply with your progress and any blockers.",
    );

    const delta = await extractDelta(demoReply, getGraph(), demoSource);
    expect(delta.upsertEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task.rollback-runbook--DEPENDS_ON--task.retention-window",
        }),
      ]),
    );
    expect(
      delta.upsertEdges?.some(
        (edge) => edge.id === "task.rollback-runbook--DEPENDS_ON--team.legal-ops",
      ),
    ).toBe(false);

    const { changed } = applyDelta(delta);
    const conflicts = await findContradictions(getGraph(), changed);
    expect(conflicts.map((edge) => edge.id)).toEqual([
      "blocker.waiting-on-legal--CONFLICTS_WITH--decision.legal-approvals-cleared",
    ]);
  });
});
