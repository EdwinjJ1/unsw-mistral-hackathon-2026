import { requestStructured } from "./structured.js";
import { triageSchema } from "./schemas.js";

type Category = "update" | "blocker" | "question" | "noise";

function fallbackTriage(text: string): Category {
  const normalized = text.normalize("NFKC").toLowerCase().trim();

  if (
    /\b(blocked|blocker|stuck|cannot|can['’]?t|unable|waiting\s+(?:for|on)|never\s+(?:heard|got)|held\s+up|prevent(?:ed|ing)?)\b/i.test(
      normalized,
    ) ||
    /(?:受阻|卡住|无法|等待|没回复)/u.test(normalized)
  ) {
    return "blocker";
  }

  if (
    /[?？]/u.test(normalized) ||
    /^(?:can|could|would|will|do|does|did|is|are|when|where|who|what|why|how)\b/i.test(
      normalized,
    ) ||
    /(?:请问|是否|怎么|为什么|何时)/u.test(normalized)
  ) {
    return "question";
  }

  if (
    /\b(done|complete(?:d)?|finished|shipped|started|working|progress|updated?|approved|decided|fixed|merged|deployed|due)\b/i.test(
      normalized,
    ) ||
    /(?:完成|已做|进展|更新|上线|批准|决定)/u.test(normalized)
  ) {
    return "update";
  }

  return "noise";
}

export async function triageReply(text: string): Promise<Category> {
  const result = await requestStructured({
    model: process.env.MISTRAL_SMALL_MODEL || "mistral-small-latest",
    system:
      "Classify the reply as update, blocker, question, or noise. A blocker takes precedence when work is prevented; return only the schema value.",
    user: text.slice(0, 4_000),
    schemaName: "triage_reply",
    schema: triageSchema,
    fallback: () => ({ category: fallbackTriage(text) }),
  });

  return result.category;
}
