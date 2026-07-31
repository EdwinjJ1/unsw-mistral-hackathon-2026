import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateGraphFromText } from "../generate-graph-from-text.js";
import { setStructuredTransportForTests } from "../structured.js";

const document = `# Launch plan
## Engineering
- [ ] Rollback runbook (Owner: Alice, due: 2026-08-01, depends on Legal)
## Legal
Decision: All Legal approvals are cleared.
Blocked: Waiting on external counsel`;

describe("generateGraphFromText", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
    setStructuredTransportForTests(undefined);
  });

  afterEach(() => {
    setStructuredTransportForTests(undefined);
    delete process.env.MISTRAL_API_KEY;
  });

  it("extracts explicit document entities and allowed relationships", async () => {
    const delta = await generateGraphFromText(document);
    expect(delta.upsertNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "team.engineering", type: "Team" }),
        expect.objectContaining({ id: "person.alice", type: "Person" }),
        expect.objectContaining({
          id: "task.rollback-runbook",
          type: "Task",
          ownerId: "person.alice",
          dueDate: "2026-08-01",
          status: "not_started",
        }),
        expect.objectContaining({ id: "team.legal", type: "Team" }),
        expect.objectContaining({ type: "Decision" }),
        expect.objectContaining({ type: "Blocker", status: "blocked" }),
      ]),
    );
    expect(delta.upsertEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "person.alice--OWNS--task.rollback-runbook",
          type: "OWNS",
        }),
        expect.objectContaining({
          id: "task.rollback-runbook--DEPENDS_ON--team.legal",
          type: "DEPENDS_ON",
        }),
      ]),
    );
    expect(delta.upsertEdges?.every((edge) => edge.type !== "CONFLICTS_WITH")).toBe(true);
    for (const change of [
      ...(delta.upsertNodes ?? []),
      ...(delta.upsertEdges ?? []),
    ]) {
      expect(change.sourceRef?.ref).toMatch(/^document:[a-f0-9]{16}$/);
      if (change.sourceRef?.quote) {
        expect(document).toContain(change.sourceRef.quote);
      }
    }
  });

  it("keeps IDs and source refs stable for repeated ingestion", async () => {
    const first = await generateGraphFromText(document);
    const second = await generateGraphFromText(document);
    expect(first.upsertNodes?.map((node) => node.id)).toEqual(
      second.upsertNodes?.map((node) => node.id),
    );
    expect(first.upsertEdges?.map((edge) => edge.id)).toEqual(
      second.upsertEdges?.map((edge) => edge.id),
    );
    expect(first.upsertNodes?.map((node) => node.sourceRef?.ref)).toEqual(
      second.upsertNodes?.map((node) => node.sourceRef?.ref),
    );
  });

  it("returns an empty delta for unparseable text", async () => {
    expect(await generateGraphFromText("Hello and thanks for reading.")).toEqual({});
    expect(await generateGraphFromText("")).toEqual({});
  });

  it("drops non-exact model evidence and forbidden ingest edges", async () => {
    delete process.env.MISTRAL_FORCE_FALLBACK;
    process.env.MISTRAL_API_KEY = "test-key";
    setStructuredTransportForTests(async () =>
      JSON.stringify({
        nodes: [
          {
            type: "Task",
            label: "Ship launch",
            evidenceQuote: "a quote absent from the document",
          },
        ],
        edges: [
          {
            from: "task.ship-launch",
            to: "task.ship-launch",
            type: "CONFLICTS_WITH",
            note: "invalid",
          },
        ],
      }),
    );

    const delta = await generateGraphFromText("Task: Ship launch");
    expect(delta.upsertNodes?.[0]?.sourceRef).not.toHaveProperty("quote");
    expect(delta.upsertEdges).toBeUndefined();
  });
});
