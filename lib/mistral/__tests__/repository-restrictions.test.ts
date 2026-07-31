import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mistralRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const libRoot = dirname(mistralRoot);

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (entry === "__tests__") return [];
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|jsx)$/.test(entry)
        ? [path]
        : [];
  });
}

describe("repository restrictions", () => {
  it("keeps the public Track E API to exactly five functions", async () => {
    const api = await import("../index");
    expect(Object.keys(api).sort()).toEqual([
      "composeDM",
      "extractDelta",
      "findContradictions",
      "generateGraphFromText",
      "triageReply",
    ]);
  });

  it("imports the Mistral SDK only from client.ts", () => {
    const sdkPackage = ["@mistralai", "mistralai"].join("/");
    const importers = sourceFiles(libRoot).filter((path) =>
      readFileSync(path, "utf8").includes(sdkPackage),
    );
    expect(importers).toEqual([join(mistralRoot, "client.ts")]);
  });

  it("contains no prohibited provider imports, random IDs, or forbidden edge type", () => {
    const sources = sourceFiles(libRoot)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const mistralSources = sourceFiles(mistralRoot)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/from\s+["'](?:openai|@anthropic-ai)/i);
    expect(mistralSources).not.toMatch(/Math\s*\.\s*random\s*\(/);
    expect(mistralSources).not.toContain(["SOURCE", "D_FROM"].join(""));
  });
});
