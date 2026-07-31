import { z } from "zod";

const nodeTypeSchema = z.enum([
  "Team",
  "Person",
  "Task",
  "Decision",
  "Blocker",
]);

const statusSchema = z.enum([
  "not_started",
  "in_progress",
  "blocked",
  "at_risk",
  "done",
]);

const edgeTypeSchema = z.enum([
  "MEMBER_OF",
  "OWNS",
  "DEPENDS_ON",
  "BLOCKS",
  "CONFLICTS_WITH",
]);

export const triageSchema = z
  .object({
    category: z.enum(["update", "blocker", "question", "noise"]),
  })
  .strict();

export const deltaNodeDraftSchema = z
  .object({
    id: z.string().min(1).max(180).optional(),
    type: nodeTypeSchema,
    label: z.string().min(1).max(180),
    teamId: z.string().min(1).max(180).nullable().optional(),
    status: statusSchema.nullable().optional(),
    summary: z.string().max(600).nullable().optional(),
    ownerId: z.string().min(1).max(180).nullable().optional(),
    dueDate: z.string().max(40).nullable().optional(),
    evidenceQuote: z.string().max(500).nullable().optional(),
  })
  .strict();

export const deltaEdgeDraftSchema = z
  .object({
    from: z.string().min(1).max(180),
    to: z.string().min(1).max(180),
    type: edgeTypeSchema,
    note: z.string().max(500).nullable().optional(),
    evidenceQuote: z.string().max(500).nullable().optional(),
  })
  .strict();

export const deltaDraftSchema = z
  .object({
    nodes: z.array(deltaNodeDraftSchema).max(100),
    edges: z.array(deltaEdgeDraftSchema).max(160),
  })
  .strict();

export const composeDmSchema = z
  .object({ message: z.string().min(1).max(600) })
  .strict();

export const contradictionsSchema = z
  .object({
    conflicts: z
      .array(
        z
          .object({
            from: z.string().min(1).max(180),
            to: z.string().min(1).max(180),
            note: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
