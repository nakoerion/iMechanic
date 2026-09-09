/**
 * AI diagnosis — Slice S4 backend, server-only implementation.
 *
 * IMPORTANT — module-boundary contract (same as scans-core.ts / auth-core.ts):
 * this module reads `process.env` and calls the network (Anthropic API). It
 * must ONLY be imported dynamically from inside a `createServerFn` handler
 * body (see `ai.ts`). If it ever ends up in the client bundle the build
 * breaks and the API key would leak.
 *
 * Honest-fallback contract: this module NEVER fabricates a diagnosis. When
 * the key is missing, the network fails, or the response cannot be parsed,
 * `runAiDiagnosis` returns `{ available: false, reason }` with a
 * human-readable reason and NO diagnosis content. The caller (ai.ts) writes
 * nothing to the database on that path.
 */

export type AiRankedCause = {
  cause: string;
  confidence: number;
};

export type AiDiagnosisContent = {
  summary: string;
  rootCause: string;
  reasoning: string;
  confidence: number;
  causes: AiRankedCause[];
};

export type AiDiagnosisResult =
  | { available: true; aiDiagnosis: AiDiagnosisContent }
  | { available: false; reason: string };

export type AiDiagnosisContext = {
  codes: { code: string; status: string; title: string | null; genericCause: string | null; system: string | null }[];
  vehicle: { make: string | null; model: string | null; year: number | null; mileageKm: number | null } | null;
  rulesVerdict: "drive_on" | "repair_soon" | "stop_driving";
  rulesSummary: string;
  rulesReasons: string[];
};

export const AI_MODEL_DEFAULT = "claude-3-5-haiku-20241022";
const ANTHROPIC_VERSION = "2023-06-01";

export const REASON_NOT_CONFIGURED = "AI diagnosis isn't configured yet.";
export const REASON_UNAVAILABLE = "AI diagnosis is unavailable right now.";

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildAiPrompt(context: AiDiagnosisContext): {
  system: string;
  user: string;
} {
  const system = [
    "You are iMechanic's diagnostic assistant. You reason over OBD-II fault",
    "codes, their catalog meanings, the vehicle, and the free rules-engine",
    "severity verdict for the scan.",
    "",
    "Rules you must always follow:",
    "- Return ranked probable root causes, ordered cheapest-to-confirm-first.",
    "- Give each cause a confidence from 0 to 100.",
    "- NEVER invent data: if the data is insufficient, say so plainly.",
    "- NEVER contradict a stop_driving safety verdict: if the free verdict is",
    "  stop_driving, keep the safety urgency and never suggest driving on.",
    "- Respond with JSON ONLY, no other text, matching this shape exactly:",
    '{"summary": string, "root_cause": string, "reasoning": string,',
    ' "confidence": number, "causes": [{"cause": string, "confidence": number}]}',
  ].join("\n");
  const codeLines =
    context.codes.length === 0
      ? ["(no fault codes on this scan)"]
      : context.codes.map(
          (c) =>
            `- ${c.code} (${c.status})${c.title ? `: ${c.title}` : ""}${c.genericCause ? ` — ${c.genericCause}` : ""}${c.system ? ` [${c.system}]` : ""}`,
        );
  const vehicle = context.vehicle
    ? [
        context.vehicle.make ?? "unknown make",
        context.vehicle.model ?? "unknown model",
        context.vehicle.year ?? "unknown year",
        context.vehicle.mileageKm != null ? `${context.vehicle.mileageKm} km` : "unknown mileage",
      ].join(" / ")
    : "unknown vehicle";
  const user = [
    `Vehicle: ${vehicle}`,
    `Free rules verdict: ${context.rulesVerdict}`,
    `Rules summary: ${context.rulesSummary}`,
    "Rules reasons:",
    ...context.rulesReasons.map((r) => `- ${r}`),
    "Fault codes:",
    ...codeLines,
  ].join("\n");
  return { system, user };
}

/**
 * Parse the Anthropic Messages API response body defensively. Returns the
 * parsed diagnosis content, or null when the body is malformed or empty.
 */
export function parseAiResponseBody(body: unknown): AiDiagnosisContent | null {
  try {
    if (typeof body !== "object" || body === null) return null;
    const content = (body as { content?: unknown }).content;
    if (!Array.isArray(content)) return null;
    const text = content
      .filter(
        (b): b is { type: string; text: string } =>
          typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text",
      )
      .map((b) => b.text)
      .join("");
    if (!text.trim()) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.summary !== "string" || !p.summary.trim()) return null;
    if (typeof p.root_cause !== "string" || !p.root_cause.trim()) return null;
    if (typeof p.reasoning !== "string" || !p.reasoning.trim()) return null;
    const confidence = clampConfidence(p.confidence, 50);
    const causes: AiRankedCause[] = Array.isArray(p.causes)
      ? (p.causes as unknown[])
          .filter(
            (c): c is Record<string, unknown> =>
              typeof c === "object" && c !== null && typeof c.cause === "string" && (c.cause as string).trim().length > 0,
          )
          .map((c) => ({
            cause: (c.cause as string).trim().slice(0, 500),
            confidence: clampConfidence(c.confidence, confidence),
          }))
          .slice(0, 8)
      : [];
    return {
      summary: p.summary.trim().slice(0, 1000),
      rootCause: p.root_cause.trim().slice(0, 500),
      reasoning: p.reasoning.trim().slice(0, 4000),
      confidence,
      causes,
    };
  } catch {
    return null;
  }
}

/**
 * Serialise AI content into the single `reasoning` text column of a
 * source='ai' diagnoses row: `<summary>\n<reasoning>\nRanked causes:\n…`.
 * scans-core's parseAiRow is the inverse (splits it back apart).
 */
export function serializeAiReasoning(content: {
  summary: string;
  reasoning: string;
  causes: { cause: string; confidence: number }[];
}): string {
  const list = content.causes
    .map((c) => `- ${c.cause} (${c.confidence}%)`)
    .join("\n");
  return `${content.summary}\n${content.reasoning}\nRanked causes:\n${list}`;
}

/**
 * Run the AI diagnosis. `fetchImpl`/`env` are injectable so unit tests can
 * cover every fallback path without touching the real network.
 */
export async function runAiDiagnosis(
  context: AiDiagnosisContext,
  deps?: {
    fetchImpl?: typeof fetch;
    env?: { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string };
  },
): Promise<AiDiagnosisResult> {
  const key = (deps?.env ?? process.env).ANTHROPIC_API_KEY;
  if (!key) return { available: false, reason: REASON_NOT_CONFIGURED };
  const model =
    (deps?.env ?? process.env).ANTHROPIC_MODEL?.trim() || AI_MODEL_DEFAULT;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const { system, user } = buildAiPrompt(context);
  let res: Response;
  try {
    res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch {
    return { available: false, reason: REASON_UNAVAILABLE };
  }
  if (!res.ok) return { available: false, reason: REASON_UNAVAILABLE };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { available: false, reason: REASON_UNAVAILABLE };
  }
  const parsed = parseAiResponseBody(body);
  if (!parsed) return { available: false, reason: REASON_UNAVAILABLE };
  return { available: true, aiDiagnosis: parsed };
}
