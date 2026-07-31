import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  requestStructured,
  setStructuredTransportForTests,
} from "../structured";

const schema = z.object({ value: z.string() }).strict();

describe("shared structured output", () => {
  beforeEach(() => {
    delete process.env.MISTRAL_FORCE_FALLBACK;
    delete process.env.MISTRAL_API_KEY;
    setStructuredTransportForTests(undefined);
  });

  afterEach(() => {
    setStructuredTransportForTests(undefined);
    delete process.env.MISTRAL_FORCE_FALLBACK;
    delete process.env.MISTRAL_API_KEY;
  });

  const invoke = (fallback = () => ({ value: "fallback" })) =>
    requestStructured({
      model: "test-model",
      system: "Return a value as JSON. Follow the supplied schema.",
      user: "input",
      schemaName: "test_schema",
      schema,
      fallback,
    });

  it("uses fallback when the API key is missing", async () => {
    expect(await invoke()).toEqual({ value: "fallback" });
  });

  it("force fallback avoids a configured transport", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    process.env.MISTRAL_FORCE_FALLBACK = "1";
    const transport = vi.fn(async () => '{"value":"network"}');
    setStructuredTransportForTests(transport);

    expect(await invoke()).toEqual({ value: "fallback" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("repairs one invalid response with exactly one second call", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const transport = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce('{"value":"repaired"}');
    setStructuredTransportForTests(transport);

    expect(await invoke()).toEqual({ value: "repaired" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]![0].user).toContain("Validation failed");
    expect(transport.mock.calls[1]![0].jsonSchema).toEqual(
      transport.mock.calls[0]![0].jsonSchema,
    );
    expect(transport.mock.calls[0]![0].jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("falls back after exactly two invalid responses", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const transport = vi.fn(async () => '{"wrong":true}');
    setStructuredTransportForTests(transport);

    expect(await invoke()).toEqual({ value: "fallback" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("falls back immediately on API failure or empty content", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const failure = vi.fn(async () => {
      throw new Error("secret-bearing remote failure");
    });
    setStructuredTransportForTests(failure);
    expect(await invoke()).toEqual({ value: "fallback" });
    expect(failure).toHaveBeenCalledTimes(1);

    const empty = vi.fn(async () => []);
    setStructuredTransportForTests(empty);
    expect(await invoke()).toEqual({ value: "fallback" });
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it("handles SDK text content-part arrays", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    const transport = vi.fn(async () => [
      { type: "thinking", thinking: "ignored" },
      { type: "text", text: '{"value":"parts"}' },
    ]);
    setStructuredTransportForTests(transport);

    expect(await invoke()).toEqual({ value: "parts" });
  });

  it("computes a fresh fallback on every invocation", async () => {
    let call = 0;
    const fallback = () => ({ value: `fallback-${++call}` });
    expect(await invoke(fallback)).toEqual({ value: "fallback-1" });
    expect(await invoke(fallback)).toEqual({ value: "fallback-2" });
  });
});
