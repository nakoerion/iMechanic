/**
 * DTC helpers + ELM327 response parsing (Slice S3).
 *
 * Pure and client-safe: no Node builtins, no server imports. Shared by the
 * browser-side OBD drivers AND the server-side scan validators, exactly like
 * `email-validate.ts` is shared by the auth stubs.
 *
 * A DTC is SAE J2012, e.g. "P0420": one type letter (P/C/B/U) + four hex
 * digits. ELM327 adapters report codes as raw byte pairs on services 03
 * (stored), 07 (pending) and 0A (permanent); the first byte's top two bits
 * carry the type (00=P, 01=C, 10=B, 11=U).
 */

export type DtcStatus = "stored" | "pending" | "permanent";

export const DTC_STATUSES: DtcStatus[] = ["stored", "pending", "permanent"];

export function isDtcStatus(value: unknown): value is DtcStatus {
  return (
    value === "stored" || value === "pending" || value === "permanent"
  );
}

/**
 * Canonical form of a user-typed code ("p0420", "P-0420", "P 0420" → "P0420"),
 * or null when the input is not shaped like a DTC. Never throws — the scan
 * screen turns null into an honest inline error.
 */
export function normaliseDtc(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[PCBU][0-9A-F]{4}$/.test(compact)) return null;
  return compact;
}

const TYPE_BITS = ["P", "C", "B", "U"] as const;

/** Decode one ELM327 DTC byte-pair into canonical form. */
export function decodeDtcPair(a: number, b: number): string {
  const type = TYPE_BITS[(a >> 6) & 0x03] ?? "P";
  const digits = [((a >> 4) & 0x03), a & 0x0f, (b >> 4) & 0x0f, b & 0x0f]
    .map((n) => n.toString(16).toUpperCase())
    .join("");
  return `${type}${digits}`;
}

/** Inverse of `decodeDtcPair` — used by the demo simulator and by tests. */
export function encodeDtcPair(code: string): [number, number] {
  const typeIndex = TYPE_BITS.indexOf(
    code[0] as (typeof TYPE_BITS)[number],
  );
  if (typeIndex < 0 || !/^[0-9A-F]{4}$/.test(code.slice(1))) {
    throw new Error(`Cannot encode "${code}" as an ELM327 byte pair.`);
  }
  const d = [...code.slice(1)].map((c) => parseInt(c, 16));
  const a = (typeIndex << 6) | (d[0]! << 4) | d[1]!;
  const b = (d[2]! << 4) | d[3]!;
  return [a, b];
}

/** A failure talking to a live adapter — message is safe to show the user. */
export class ObdError extends Error {
  /** Extra plain-English guidance, e.g. "plug the adapter in with ignition on". */
  readonly hint: string | null;
  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = "ObdError";
    this.hint = hint;
  }
}

const MODE_RESPONSE_BYTE: Record<"03" | "07" | "0A", number> = {
  "03": 0x43,
  "07": 0x47,
  "0A": 0x4a,
};

/**
 * Parse a mode 03 / 07 / 0A response into canonical DTCs.
 *
 * Handles the shapes a real ELM327 produces: command echo on the first line,
 * "SEARCHING..." chatter, multi-line replies, "00 00" padding pairs and the
 * trailing ">" prompt. "NO DATA" means the ECU reported nothing — that is a
 * clean empty result, not an error. "?" / "UNABLE TO CONNECT" / "NO SYNC"
 * mean the adapter could not do the job and throw an ObdError whose message
 * is safe to show.
 */
export function parseDtcResponseText(
  text: string,
  mode: "03" | "07" | "0A",
): string[] {
  const upper = text.toUpperCase();
  if (/\bNO DATA\b/.test(upper)) return [];
  if (/(^|[\s>])\?/.test(upper)) {
    throw new ObdError(
      `The adapter did not understand the read-codes command (mode ${mode}).`,
    );
  }
  if (/\b(UNABLE TO CONNECT|NO SYNC|BUS BUSY|BUS ERROR|FB ERROR)\b/.test(upper)) {
    throw new ObdError(
      "The adapter could not talk to the car.",
      "Check the adapter is firmly plugged into the OBD2 port and the ignition is on (engine can stay off).",
    );
  }

  const bytes = upper
    .replaceAll(">", " ")
    .split(/[^0-9A-F]+/)
    .filter((t) => t.length === 2)
    .map((t) => parseInt(t, 16));
  const header = bytes.indexOf(MODE_RESPONSE_BYTE[mode]);
  if (header < 0 || header + 1 >= bytes.length) {
    throw new ObdError(
      `The adapter's reply to mode ${mode} was not readable — nothing was saved.`,
    );
  }
  const count = bytes[header + 1]!;
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = bytes[header + 2 + i * 2];
    const b = bytes[header + 3 + i * 2];
    if (a === undefined || b === undefined) break;
    if (a === 0x00 && b === 0x00) continue; // padding pair
    codes.push(decodeDtcPair(a, b));
  }
  return codes;
}

/**
 * Best-effort VIN decode from a mode 0902 reply. Returns the 17-character VIN
 * or null when the reply is not parseable — callers treat null as "the car
 * did not report a VIN", never as a failure.
 */
export function parseVinResponseText(text: string): string | null {
  const upper = text.toUpperCase();
  if (/\bNO DATA\b/.test(upper)) return null;
  const bytes = upper
    .replaceAll(">", " ")
    .split(/[^0-9A-F]+/)
    .filter((t) => t.length === 2)
    .map((t) => parseInt(t, 16));
  // "49 02 ..." — drop the header; an ISO-TP reply starts the payload with a
  // length byte (0x11 = 17), a J1850 reply starts with the VIN directly.
  const header = bytes.indexOf(0x49);
  if (header < 0) return null;
  let payload = bytes.slice(header + 1);
  if (payload[0] === 0x02) payload = payload.slice(1);
  if (payload[0] === 0x01 || payload[0] === 0x11) payload = payload.slice(1);
  const ascii = payload
    .map((b) => String.fromCharCode(b))
    .join("")
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
  const vin = ascii.slice(0, 17);
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}
