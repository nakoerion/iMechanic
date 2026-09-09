/**
 * AI diagnosis unit tests — S4 backend (Slice S4).
 *
 * Pure unit tests, NO database, NO real network: `runAiDiagnosis` takes an
 * injectable `fetchImpl` and `env`, so every fallback path is covered with
 * fakes. A real Anthropic call is never made here (the one live smoke test
 * is a manual throwaway run by the engineer, reported in the PR).
 */
import { describe, expect, it } from "vitest";
import {
  buildAiPrompt,
  parseAiResponseBody,
  REASON_NOT_CONFIGURED,
  REASON_UNAVAILABLE,
  runAiDiagnosis,
  serializeAiReasoning,
  type AiDiagnosisContext,
} from "../src/server/ai-core";

const CONTEXT: AiDiagnosisContext = {
  codes: [
    {
      code: "P0301",
      status: "stored",
      title: "Cylinder 1 misfire",
      genericCause: "Worn spark plug or ignition coil.",
      system: "Powertrain",
    },
    {
      code: "P0420",
      status: "stored",
      title: "Catalyst efficiency below threshold",
      genericCause: "Ageing catalytic converter.",
      system: "Emissions",
    },
  ],
  vehicle: { make: "Toyota", model: "Corolla", year: 2014, mileageKm: 180000 },
  rulesVerdict: "stop_driving",
  rulesSummary: "Stored misfire with a stored catalyst code.",
  rulesReasons: ["P0301 stored", "P0420 stored"],
};

function okFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

function aiBody(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          summary: "Likely a failing ignition coil on cylinder 1.",
          root_cause: "Failing ignition coil on cylinder 1",
          reasoning: "Misfire plus catalyst code points at raw fuel.",
          confidence: 78,
          causes: [
            { cause: "Ignition coil on cylinder 1", confidence: 78 },
            { cause: "Spark plug on cylinder 1", confidence: 60 },
          ],
          ...overrides,
        }),
      },
    ],
  };
}

const ENV = { ANTHROPIC_API_KEY: "test-key" };

describe("runAiDiagnosis fallback contract", () => {
  it("key missing → available:false with the 'not configured' reason", async () => {
    const result = await runAiDiagnosis(CONTEXT, {
      env: {},
      fetchImpl: okFetch(aiBody()),
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe(REASON_NOT_CONFIGURED);
  });

  it("non-2xx → available:false with the 'unavailable' reason", async () => {
    const result = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch({ error: "overloaded" }, 529),
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe(REASON_UNAVAILABLE);
  });

  it("network throw → available:false with the 'unavailable' reason", async () => {
    const throwing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const result = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: throwing,
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe(REASON_UNAVAILABLE);
  });

  it("malformed JSON text → available:false with the 'unavailable' reason", async () => {
    const result = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch({ content: [{ type: "text", text: "not json {" }] }),
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe(REASON_UNAVAILABLE);
  });

  it("empty content → available:false with the 'unavailable' reason", async () => {
    const result = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch({ content: [] }),
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe(REASON_UNAVAILABLE);
  });
});

describe("runAiDiagnosis success path", () => {
  it("well-formed JSON → available:true with mapped fields", async () => {
    const result = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch(aiBody()),
    });
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.aiDiagnosis.summary).toContain("ignition coil");
      expect(result.aiDiagnosis.rootCause).toBe(
        "Failing ignition coil on cylinder 1",
      );
      expect(result.aiDiagnosis.confidence).toBe(78);
      expect(result.aiDiagnosis.causes).toHaveLength(2);
      expect(result.aiDiagnosis.causes[0]).toEqual({
        cause: "Ignition coil on cylinder 1",
        confidence: 78,
      });
    }
  });

  it("confidence is clamped to 0-100", async () => {
    const high = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch(aiBody({ confidence: 250 })),
    });
    if (high.available) expect(high.aiDiagnosis.confidence).toBe(100);
    else throw new Error("expected available:true");
    const low = await runAiDiagnosis(CONTEXT, {
      env: ENV,
      fetchImpl: okFetch(aiBody({ confidence: -40 })),
    });
    if (low.available) expect(low.aiDiagnosis.confidence).toBe(0);
    else throw new Error("expected available:true");
  });
});

describe("parseAiResponseBody", () => {
  it("ranked causes map with per-cause confidence", () => {
    const parsed = parseAiResponseBody(aiBody());
    expect(parsed?.causes.map((c) => c.cause)).toEqual([
      "Ignition coil on cylinder 1",
      "Spark plug on cylinder 1",
    ]);
    expect(parsed?.causes[1]?.confidence).toBe(60);
  });

  it("missing causes array → empty list, missing confidence → fallback", () => {
    const parsed = parseAiResponseBody(
      aiBody({ causes: undefined, confidence: undefined }),
    );
    expect(parsed?.causes).toEqual([]);
    expect(parsed?.confidence).toBe(50);
  });
});

describe("prompt", () => {
  it("mentions the stop_driving verdict and never-driving-on constraint", () => {
    const { system, user } = buildAiPrompt(CONTEXT);
    expect(system).toContain("stop_driving");
    expect(user).toContain("stop_driving");
    expect(user).toContain("P0301");
    expect(user).toContain("P0420");
    expect(user).toContain("Toyota");
  });
});

describe("serializeAiReasoning round-trip shape", () => {
  it("embeds summary, reasoning and the ranked list as plain text", () => {
    const text = serializeAiReasoning({
      summary: "Likely a coil.",
      reasoning: "Because reasons.",
      causes: [{ cause: "Coil", confidence: 78 }],
    });
    expect(text).toContain("Likely a coil.");
    expect(text).toContain("Because reasons.");
    expect(text).toContain("- Coil (78%)");
  });
});
