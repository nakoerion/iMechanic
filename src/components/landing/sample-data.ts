import type { Severity } from "../../lib/severity";
import type { DtcStatus } from "../severity/fault-code-card";

/**
 * Sample fault codes used by the landing page's product showcase.
 *
 * HONESTY: these are illustrative codes typed into the real app components —
 * they are NOT a real vehicle and they are NOT a live scan. Every surface that
 * renders them must carry a visible "sample" caption (see SAMPLE_CAPTION), the
 * same rule the app follows for demo scans (AGENTS.md: honesty in data).
 *
 * The wording, severity and cause text below mirror what `dtc_catalog` seeds
 * for these codes, so the showcase shows the product's real voice.
 */

export type SampleCode = {
  code: string;
  title: string;
  system: string;
  genericCause: string;
  severity: Severity;
  status: DtcStatus;
};

/** The misfire story the whole showcase follows: scan → verdict → cost → repair. */
export const SAMPLE_SCAN: SampleCode[] = [
  {
    code: "P0301",
    title: "Cylinder 1 is misfiring",
    system: "Ignition",
    genericCause: "Commonly a worn spark plug or a failing ignition coil.",
    severity: "repair_soon",
    status: "stored",
  },
  {
    code: "P0442",
    title: "Small leak in the fuel vapour system",
    system: "Emissions",
    genericCause: "A loose or worn fuel cap seal is the usual culprit.",
    severity: "drive_on",
    status: "pending",
  },
];

/** Used to show the third verdict state with a code that really earns it. */
export const SAMPLE_STOP_DRIVING: SampleCode = {
  code: "P0217",
  title: "Engine is over-temperature",
  system: "Cooling",
  genericCause: "Low coolant, a stuck thermostat or a failed water pump.",
  severity: "stop_driving",
  status: "permanent",
};

export const SAMPLE_CAPTION =
  "Sample fault codes shown in the app's real screens — not a live scan and not a real vehicle.";
