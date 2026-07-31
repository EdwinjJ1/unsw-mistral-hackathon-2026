import { beforeEach, describe, expect, it } from "vitest";

import { triageReply } from "../triage-reply";
import { demoReply } from "./fixtures";

describe("triageReply fallback", () => {
  beforeEach(() => {
    process.env.MISTRAL_FORCE_FALLBACK = "1";
  });

  it.each([
    ["I finished the migration today.", "update"],
    ["DEPLOYED — everything is live!", "update"],
    ["We're stuck waiting on Security.", "blocker"],
    ["CAN’T proceed until Legal replies.", "blocker"],
    ["When is the review?", "question"],
    ["这个决定是否批准？", "question"],
    ["Thanks!", "noise"],
    ["👍 sounds good", "noise"],
  ] as const)("classifies %s as %s", async (text, expected) => {
    expect(await triageReply(text)).toBe(expected);
  });

  it("gives blocker precedence over done in the required reply", async () => {
    expect(await triageReply(demoReply)).toBe("blocker");
  });
});
