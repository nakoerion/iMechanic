/**
 * Demo-mode simulator (Slice S3) — the primary testable path, no hardware.
 *
 * Implements the same `ObdDriver` interface as the live ELM327 driver, so
 * the scan screen never cares where its data came from. Everything it
 * returns is clearly demo data: the scan row is persisted with
 * `source = 'demo'` and the UI badges it as demo.
 *
 * Deterministic and seedable: the default dataset is fixed, and `reset()`
 * restores it after a demo clear. `clearCodes()` only empties this
 * instance's simulated list — it touches no car, which the UI says plainly.
 */

import { encodeDtcPair } from "../lib/dtc";
import {
  DEMO_DATASET_LABEL,
  DEMO_VIN,
  type DtcStatus,
  type ObdCode,
  type ObdDriver,
  type ObdScanResult,
} from "./driver";

type DemoRow = { code: string; status: DtcStatus };

/**
 * The demo car: a mid-2010s petrol hatchback with a tired catalyst, a recent
 * misfire, and one pending EVAP code — realistic enough to exercise the UI,
 * small enough to read at a glance. Statuses cover all three scan-code kinds.
 *
 * SCOPE DECISION (lead, 2026-09-08 — do not relitigate): the safety rule
 * "stored misfire + stored catalyst → stop_driving" stays, so the demo
 * dataset must NOT pair a stored misfire with a stored catalyst — the first
 * demo tap must land on repair_soon, not stop_driving. The misfire is
 * therefore pending (unconfirmed): the engine treats it as repair_soon via
 * the stored lean-family code P0171. Statuses still cover all three kinds.
 */
export const DEMO_DATASET: readonly DemoRow[] = [
  { code: "P0420", status: "stored" },
  { code: "P0171", status: "stored" },
  { code: "P0301", status: "pending" },
  { code: "P0442", status: "permanent" },
] as const;

/** Hex-dump the dataset the way a real adapter would send it (for tests). */
export function demoDatasetAsElmResponse(mode: "03" | "07" | "0A"): string {
  const rows = DEMO_DATASET.filter((r) =>
    mode === "03"
      ? r.status === "stored"
      : mode === "07"
        ? r.status === "pending"
        : r.status === "permanent",
  );
  const header = mode === "03" ? "43" : mode === "07" ? "47" : "4A";
  const body = rows
    .map((r) =>
      encodeDtcPair(r.code)
        .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
        .join(" "),
    )
    .join(" ");
  const count = rows.length.toString(16).toUpperCase().padStart(2, "0");
  return `${mode}\r${header} ${count}${body ? ` ${body}` : ""}\r\r>`;
}

export class DemoDriver implements ObdDriver {
  readonly label = "Demo adapter (simulated)";
  private connected = false;
  private codes: DemoRow[] = [...DEMO_DATASET];

  get datasetLabel(): string {
    return DEMO_DATASET_LABEL;
  }

  async connect(): Promise<void> {
    // Simulated handshake: no transport, nothing to fail.
    await Promise.resolve();
    this.connected = true;
  }

  async readCodes(): Promise<ObdScanResult> {
    if (!this.connected) {
      throw new Error("Demo adapter is not connected.");
    }
    const codes: ObdCode[] = this.codes.map((c) => ({ ...c }));
    return { codes, vin: DEMO_VIN };
  }

  async clearCodes(): Promise<void> {
    if (!this.connected) {
      throw new Error("Demo adapter is not connected.");
    }
    // Demo-only reset of the simulated fault list — touches no car.
    this.codes = [];
  }

  async disconnect(): Promise<void> {
    await Promise.resolve();
    this.connected = false;
  }

  /** Restore the default dataset (used after a demo clear, and by tests). */
  reset(): void {
    this.codes = [...DEMO_DATASET];
  }
}
