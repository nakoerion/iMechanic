/**
 * Slice A5 — the scan/connect "ignition sequence".
 *
 * Two things are proved here, both with no hardware and no database:
 *
 *   1. the driver's new transcript observer — every exchange of a real
 *      connect + read is delivered as it happens, the persisted transcript is
 *      unchanged, unsubscribing stops delivery, and a broken listener can
 *      never fail a scan;
 *   2. the rail/transcript rendering — injected fake entries only, so what the
 *      panel can show is pinned down: the last few exchanges, collapsed to one
 *      honest line each, and nothing at all when there is nothing to show
 *      (which is the demo and manual case).
 *
 * A fake Web Serial adapter at the seam the driver actually uses
 * (`requestPort` → open → readable/writable streams) drives the live path: it
 * is the transport whose reader pump can be exercised end-to-end here, and it
 * goes through exactly the same `connect()` handshake + `readCodes()` sequence
 * the scan screen runs.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveElmDriver } from "../src/obd/elm327-live";
import type { ObdTranscriptEntry } from "../src/obd/driver";
import { demoDatasetAsElmResponse } from "../src/obd/demo-simulator";
import {
  LiveTranscript,
  PhaseRail,
  SCAN_STEPS,
  TRANSCRIPT_VISIBLE_LINES,
  formatTranscriptResponse,
  scanStepIndex,
  stepForCommand,
} from "../src/components/scan/ignition-sequence";

const g = globalThis as unknown as Record<string, unknown>;
let navigatorDescriptor: PropertyDescriptor | undefined;

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(g, name, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

beforeEach(() => {
  navigatorDescriptor = Object.getOwnPropertyDescriptor(g, "navigator");
});

afterEach(() => {
  if (navigatorDescriptor) {
    Object.defineProperty(g, "navigator", navigatorDescriptor);
  } else {
    delete g.navigator;
  }
});

/* ------------------------------------------------------------------ *
 * A fake ELM327 over Web Serial
 * ------------------------------------------------------------------ */

/**
 * The adapter's answers, in the shape a real ELM327 sends them. The three
 * read services reuse the demo dataset's ELM encoding (the same parser path
 * the app uses), and 0902 answers NO DATA — a car that will not report a VIN
 * still scans, which is exactly the case worth covering.
 */
function adapterReply(command: string): string {
  switch (command) {
    case "ATZ":
      return "ATZ\rELM327 v1.5\r\r>";
    case "ATE0":
    case "ATH0":
      return "OK\r>";
    case "0100":
      return "41 00 BE 3E B8 13\r>";
    case "03":
      return demoDatasetAsElmResponse("03");
    case "07":
      return demoDatasetAsElmResponse("07");
    case "0A":
      return demoDatasetAsElmResponse("0A");
    default:
      return "NO DATA\r>";
  }
}

/** A fake USB adapter: commands in, raw adapter bytes back down the pipe. */
function fakeSerialAdapter() {
  const writes: string[] = [];
  let sink: ReadableStreamDefaultController<Uint8Array> | null = null;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      sink = controller;
    },
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const command = new TextDecoder().decode(chunk).trim();
      writes.push(command);
      // The adapter answers as soon as the command lands on the wire.
      sink?.enqueue(new TextEncoder().encode(adapterReply(command)));
    },
  });
  const port = {
    async open() {
      /* the port is always there in the fake */
    },
    async close() {
      sink?.close();
    },
    readable,
    writable,
  };
  setGlobal("navigator", {
    serial: {
      async requestPort() {
        return port;
      },
    },
  });
  return { writes };
}

const HANDSHAKE = ["ATZ", "ATE0", "ATH0", "0100"];
const READ_SERVICES = ["03", "07", "0A", "0902"];

describe("LiveElmDriver transcript observer (A5)", () => {
  it("delivers every exchange as it happens, without changing the log", async () => {
    const { writes } = fakeSerialAdapter();
    const seen: ObdTranscriptEntry[] = [];
    const driver = new LiveElmDriver("serial");
    const off = driver.onTranscriptEntry((entry) => seen.push(entry));

    await driver.connect();
    const result = await driver.readCodes();
    await driver.disconnect();
    off();

    expect(writes).toEqual([...HANDSHAKE, ...READ_SERVICES]);
    expect(seen.map((e) => e.command)).toEqual([...HANDSHAKE, ...READ_SERVICES]);
    // Every observed entry is a real adapter reply, timestamped, uncut.
    expect(seen.every((e) => typeof e.at === "string" && e.at.length > 0)).toBe(
      true,
    );
    expect(seen[0]!.response).toBe("ATZ\rELM327 v1.5\r\r>");

    // R3 is untouched: the persisted transcript is the driver's own full log,
    // same content, distinct objects (the UI holds its own copies).
    const log = driver.getTranscript();
    expect(log.transport).toBe("serial");
    expect(log.adapter).toBe("USB adapter");
    expect(log.entries.map((e) => e.command)).toEqual([
      ...HANDSHAKE,
      ...READ_SERVICES,
    ]);
    expect(log.entries).toEqual(seen);
    expect(log.entries[0]).not.toBe(seen[0]);
    expect(result.transcript?.entries).toHaveLength(seen.length);
    expect(result.codes.map((c) => c.code)).toEqual([
      "P0420",
      "P0171",
      "P0301",
      "P0442",
    ]);
    // NO DATA for the VIN is an honest null, not a fabricated string.
    expect(result.vin).toBeNull();
  });

  it("stops delivering once unsubscribed", async () => {
    fakeSerialAdapter();
    const seen: ObdTranscriptEntry[] = [];
    const driver = new LiveElmDriver("serial");
    const off = driver.onTranscriptEntry((entry) => seen.push(entry));

    await driver.connect();
    expect(seen).toHaveLength(HANDSHAKE.length);
    off();
    await driver.readCodes();
    await driver.disconnect();
    expect(seen).toHaveLength(HANDSHAKE.length);
  });

  it("never lets a broken observer fail a scan", async () => {
    fakeSerialAdapter();
    const seen: ObdTranscriptEntry[] = [];
    const driver = new LiveElmDriver("serial");
    driver.onTranscriptEntry(() => {
      throw new Error("a rendering bug");
    });
    driver.onTranscriptEntry((entry) => seen.push(entry));

    await driver.connect();
    const result = await driver.readCodes();
    await driver.disconnect();

    expect(result.codes).toHaveLength(4);
    expect(seen).toHaveLength(HANDSHAKE.length + READ_SERVICES.length);
  });

  it("maps real commands onto the rail, and guesses at nothing", () => {
    for (const cmd of HANDSHAKE) expect(stepForCommand(cmd)).toBe("initialise");
    expect(stepForCommand(" atz ")).toBe("initialise");
    for (const cmd of READ_SERVICES) expect(stepForCommand(cmd)).toBe("read");
    // A command that is neither: the rail stays where it is.
    for (const cmd of ["04", "0906", "", "41 00"]) {
      expect(stepForCommand(cmd)).toBeNull();
    }
  });

  it("orders the four steps so the rail can only move forward", () => {
    expect([...SCAN_STEPS]).toEqual([
      "connect",
      "initialise",
      "read",
      "interpret",
    ]);
    expect(scanStepIndex("connect")).toBeLessThan(scanStepIndex("initialise"));
    expect(scanStepIndex("initialise")).toBeLessThan(scanStepIndex("read"));
    expect(scanStepIndex("read")).toBeLessThan(scanStepIndex("interpret"));
  });
});

/* ------------------------------------------------------------------ *
 * Rendering — injected entries only, no hardware
 * ------------------------------------------------------------------ */

function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

function entry(command: string, response: string): ObdTranscriptEntry {
  return { at: "2026-09-21T10:00:00.000Z", command, response };
}

describe("PhaseRail (A5)", () => {
  it("renders the four approved steps, once, in order", () => {
    const html = markup(createElement(PhaseRail, { activeStep: "read" }));
    for (const label of ["Connect", "Initialise", "Read", "Interpret"]) {
      expect(html).toContain(label);
    }
    expect(html.split("<li").length - 1).toBe(4);
    // Exactly one step is the current one.
    expect(html.split('aria-current="step"').length - 1).toBe(1);
    // The rail names itself for assistive tech.
    expect(html).toContain('aria-label="Scan procedure"');
  });

  it("marks the current step on the right tick, whatever the step", () => {
    const html = markup(createElement(PhaseRail, { activeStep: "connect" }));
    const current = html.slice(html.indexOf('aria-current="step"'));
    expect(current).toContain("Connect");
    // Nothing before Connect can be complete: no check mark on the first tick.
    expect(html.indexOf('aria-current="step"')).toBeLessThan(
      html.indexOf("Initialise"),
    );
  });

  it("marks completed steps with a check", () => {
    const first = markup(createElement(PhaseRail, { activeStep: "connect" }));
    const third = markup(createElement(PhaseRail, { activeStep: "read" }));
    expect(first.split("<svg").length - 1).toBe(0);
    expect(third.split("<svg").length - 1).toBe(2);
  });
});

describe("LiveTranscript (A5)", () => {
  it("renders nothing at all when there is nothing to show", () => {
    // The demo and manual case: no adapter, so no transcript — not an empty box.
    expect(markup(createElement(LiveTranscript, { entries: [] }))).toBe("");
  });

  it("shows only the last few exchanges, under the tech legend", () => {
    const entries = [
      entry("ATZ", "ATZ\rELM327 v1.5\r\r>"),
      entry("ATE0", "OK\r>"),
      entry("ATH0", "OK\r>"),
      entry("0100", "41 00 BE 3E B8 13\r>"),
      entry("03", "43 02 04 20 01 71\r\r>"),
    ];
    const html = markup(createElement(LiveTranscript, { entries }));
    expect(html).toContain("Adapter link");
    expect(html.split("<li").length - 1).toBe(TRANSCRIPT_VISIBLE_LINES);
    // The older lines are gone — the panel is the last few, not the log.
    expect(html).not.toContain("ATZ");
    expect(html).not.toContain("ATE0");
    expect(html).toContain("0100");
    expect(html).toContain("03");
  });

  it("collapses each reply to one honest line — never a raw dump", () => {
    const html = markup(
      createElement(LiveTranscript, {
        entries: [entry("03", "43 02 04 20 01 71\r\r>")],
      }),
    );
    expect(html).not.toContain("\r");
    // The ELM327 prompt is the adapter's turn marker, not data — dropped.
    expect(html).toContain("43 02 04 20 01 71");
    expect(html).not.toContain("&gt;");
    // Raw JSON of an entry can never leak into the panel.
    expect(html).not.toContain("T10:00:00");
  });

  it("caps a long payload instead of wrapping the panel", () => {
    const long = "49 02 01 " + "AB ".repeat(80);
    const line = formatTranscriptResponse(long);
    expect(line.length).toBeLessThanOrEqual(72);
    expect(line.endsWith("…")).toBe(true);
  });

  it("renders an empty reply as a dash, never as invented content", () => {
    expect(formatTranscriptResponse("   \r\r> ")).toBe("—");
    const html = markup(
      createElement(LiveTranscript, { entries: [entry("ATE0", "")] }),
    );
    expect(html).toContain("—");
  });
});
