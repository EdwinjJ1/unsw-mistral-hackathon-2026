import { z } from "zod";

import {
  hasMistralApiKey,
  requestMistralStructuredContent,
} from "./client";
import type {
  StructuredTransport,
  StructuredTransportRequest,
} from "./models";

interface StructuredOptions<T> {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  fallback: () => T;
}

let transportOverride: StructuredTransport | undefined;

export function setStructuredTransportForTests(
  transport: StructuredTransport | undefined,
): void {
  transportOverride = transport;
}

function forceFallback(): boolean {
  return process.env.MISTRAL_FORCE_FALLBACK === "1";
}

function warnFallback(schemaName: string, reason: string, error?: unknown): void {
  const detail =
    error === undefined
      ? ""
      : ` (${error instanceof Error ? error.message : String(error)})`;
  console.warn(`[mistral] ${schemaName}: ${reason}${detail} - using deterministic fallback`);
}

function schemaToJson(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = { ...z.toJSONSchema(schema) };
  delete jsonSchema.$schema;
  return jsonSchema;
}

function contentText(content: unknown): string | undefined {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || undefined;
  }

  if (!Array.isArray(content)) return undefined;

  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const candidate = part as Record<string, unknown>;
      return candidate.type === "text" && typeof candidate.text === "string"
        ? candidate.text
        : "";
    })
    .join("")
    .trim();

  return text || undefined;
}

function stripJsonFence(value: string): string {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? value;
}

function parseAndValidate<T>(
  content: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return { success: false, error: "response was not valid JSON" };
  }

  const result = schema.safeParse(parsed);
  if (result.success) return { success: true, data: result.data };

  const issue = result.error.issues[0];
  const location = issue?.path.length ? issue.path.join(".") : "root";
  const message = issue?.message ?? "schema validation failed";
  return {
    success: false,
    error: `${location}: ${message}`.replace(/\s+/g, " ").slice(0, 180),
  };
}

export async function requestStructured<T>(
  options: StructuredOptions<T>,
): Promise<T> {
  if (
    forceFallback() ||
    (!transportOverride && !hasMistralApiKey())
  ) {
    return options.fallback();
  }

  const transport = transportOverride ?? requestMistralStructuredContent;
  const baseRequest: StructuredTransportRequest = {
    model: options.model,
    system: options.system,
    user: options.user,
    schemaName: options.schemaName,
    jsonSchema: schemaToJson(options.schema),
  };

  let firstContent: unknown;
  try {
    firstContent = await transport(baseRequest);
  } catch (error) {
    warnFallback(options.schemaName, "request failed", error);
    return options.fallback();
  }

  const firstText = contentText(firstContent);
  if (!firstText) {
    warnFallback(options.schemaName, "empty response");
    return options.fallback();
  }

  const first = parseAndValidate(firstText, options.schema);
  if (first.success) return first.data;

  const repairRequest: StructuredTransportRequest = {
    ...baseRequest,
    user: `${options.user}\nValidation failed: ${first.error}. Return one valid JSON object only.`,
  };

  let repairedContent: unknown;
  try {
    repairedContent = await transport(repairRequest);
  } catch (error) {
    warnFallback(options.schemaName, "repair request failed", error);
    return options.fallback();
  }

  const repairedText = contentText(repairedContent);
  if (!repairedText) {
    warnFallback(options.schemaName, "empty repair response");
    return options.fallback();
  }

  const repaired = parseAndValidate(repairedText, options.schema);
  if (!repaired.success) {
    warnFallback(options.schemaName, `still invalid after repair (${repaired.error})`);
    return options.fallback();
  }
  return repaired.data;
}
