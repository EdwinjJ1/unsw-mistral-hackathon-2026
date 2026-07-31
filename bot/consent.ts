const CONSENT_LINE =
  "I'm Athena. I'll store task updates, blockers, and source message IDs so the project graph stays current.";

// First-contact consent is intentionally process-local. Discord delivery receipts
// prevent duplicate plan DMs; this set only controls whether the disclosure is
// prepended to the next distinct message in the current bot process.
const contacted = new Set<string>();

export function withFirstContactConsent(userId: string, body: string): string {
  if (contacted.has(userId)) return body;
  contacted.add(userId);
  return `${CONSENT_LINE}\n\n${body}`;
}
