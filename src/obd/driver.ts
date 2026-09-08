/**
 * OBD2 driver interface + capabilities (Slice S3).
 *
 * Client-side ONLY — the Web Bluetooth / Web Serial drivers touch browser
 * APIs, so nothing in this file may ever be imported by a server function.
 * The three implementations share one interface so the scan screen never
 * cares where the data came from:
 *
 *   - `demo-simulator.ts` — simulated ELM327, always available, no hardware.
 *   - `elm327-live.ts`    — the real ELM327 driver (Web Bluetooth + Web
 *                           Serial). iOS Safari supports neither — the scan
 *                           screen says so honestly instead of failing.
 *   - manual entry needs no driver: the scan screen sends a single typed
 *     code to the server, which persists it as `source: 'manual'`.
 */

import type { DtcStatus } from "./dtc";

export type { DtcStatus } from "./dtc";

/** One code read from the adapter, in ready-to-persist shape. */
export type ObdCode = {
  code: string;
  status: DtcStatus;
};

/**
 * One raw command → response exchange with the adapter (R3 honesty
 * guarantee). The honest raw data: exact command text and the reply
 * exactly as the adapter sent it — never trimmed, never reinterpreted.
 */
export type ObdTranscriptEntry = {
  /** ISO timestamp of when the reply arrived. */
  at: string;
  /** The exact command text sent (ATZ, 03, 0902, 04…). */
  command: string;
  /** The raw reply text, exactly as the adapter sent it. */
  response: string;
};

/**
 * Session log for a live scan. Persisted into `scans.raw_json` (the seed of
 * the replay regression library) — never rendered as raw dumps in the UI.
 * Live-driver-specific: manual entry and demo have no adapter to transcribe.
 */
export type ObdTranscript = {
  transport: "bluetooth" | "serial";
  /** Adapter identity string (device / port name). OBD traffic only. */
  adapter: string;
  entries: ObdTranscriptEntry[];
};

/** What a scan run produced — mirrored into `scans` + `scan_codes`. */
export type ObdScanResult = {
  codes: ObdCode[];
  /** The VIN the car reported, if any. Never invented. */
  vin: string | null;
  /** Live scans only: the session transcript. Absent for demo/manual. */
  transcript?: ObdTranscript | null;
};

/** Where the transport can go. Checked before any connect button is enabled. */
export type ObdCapabilities = {
  bluetooth: boolean;
  serial: boolean;
};

/** Everyone agrees on this shape: demo, live, and any future driver. */
export interface ObdDriver {
  /** Human label for the connected adapter (demo / device name / port). */
  readonly label: string;
  /** Open the transport and run the ELM327 handshake (ATZ, ATE0, ATH0…). */
  connect(): Promise<void>;
  /** Read stored + pending + permanent DTCs, plus the VIN when reported. */
  readCodes(): Promise<ObdScanResult>;
  /** Send CLRDTC (service 04). Free forever — never gated, never badged. */
  clearCodes(): Promise<void>;
  /** Close the transport. Safe to call when not connected. */
  disconnect(): Promise<void>;
}

export type ScanSource = "live" | "demo" | "manual";

/**
 * Browser transport support, evaluated lazily so server-side rendering never
 * touches `navigator`. Android Chrome exposes Web Bluetooth; desktop
 * Chrome/Edge expose Web Serial; iOS Safari exposes neither — the scan
 * screen shows an honest "not available in this browser" state there.
 */
export function browserCapabilities(): ObdCapabilities {
  if (typeof navigator === "undefined") return { bluetooth: false, serial: false };
  const nav = navigator as Navigator & {
    bluetooth?: unknown;
    serial?: unknown;
  };
  return {
    bluetooth: typeof nav.bluetooth !== "undefined",
    serial: typeof nav.serial !== "undefined",
  };
}

/** Demo data, described once so the UI and the simulator can't drift apart. */
export const DEMO_DATASET_LABEL = "Demo car — a 2016 petrol hatchback";

/** The VIN the demo car reports. Clearly fake (check-digit-free prefix). */
export const DEMO_VIN = "IMD3M0HATCH16X0001";
