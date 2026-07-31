import { Mistral } from "@mistralai/mistralai";

import type { StructuredTransportRequest } from "./models.js";

let client: Mistral | undefined;
let clientApiKey: string | undefined;

export function hasMistralApiKey(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY?.trim());
}

function getClient(): Mistral | undefined {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return undefined;

  if (!client || clientApiKey !== apiKey) {
    client = new Mistral({
      apiKey,
      retryConfig: { strategy: "none" },
      timeoutMs: 12_000,
    });
    clientApiKey = apiKey;
  }

  return client;
}

export async function requestMistralStructuredContent(
  request: StructuredTransportRequest,
): Promise<unknown> {
  const activeClient = getClient();
  if (!activeClient) return undefined;

  const response = await activeClient.chat.complete({
    model: request.model,
    temperature: 0,
    randomSeed: 0,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    responseFormat: {
      type: "json_schema",
      jsonSchema: {
        name: request.schemaName,
        schemaDefinition: request.jsonSchema,
        strict: true,
      },
    },
  });

  return response.choices[0]?.message?.content;
}
