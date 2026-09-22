/**
 * Live ELM327 driver (Slice S3) — Web Bluetooth + Web Serial + the native BLE
 * bridge (Slice S7), best effort.
 *
 * Client-side ONLY. Never import into a server function (browser globals).
 *
 * Handshake on connect (standard ELM327 AT sequence):
 *   ATZ → reset, ATE0 → echo off, ATH0 → headers off,
 *   0100 → PID-bank support detect (proves the car answers OBD).
 *
 * Codes: service 03 (stored), 07 (pending), 0A (permanent).
 * Clear:  service 04 (CLRDTC). Free forever — the UI never gates it.
 *
 * Three transports, one interface:
 *   "bluetooth" — Web Bluetooth (Android Chrome, desktop Chrome/Edge).
 *   "serial"    — Web Serial (desktop Chrome/Edge over a USB adapter).
 *   "native"    — the `iMechanicBle` bridge inside the Capacitor iOS/Android
 *                 shell. Required on iPhone: iOS Safari has no Web Bluetooth
 *                 at all, so CoreBluetooth is the only way to reach a real
 *                 adapter there. See `src/native/ble-bridge.ts`.
 *
 * Where none of the three exists the scan screen reads
 * `browserCapabilities()` and shows an honest unavailable state instead of
 * ever constructing one of these. When constructed without hardware the
 * connect step fails with an ObdError — never a fabricated scan.
 */

/* Minimal structural types for the two Web APIs. Deliberately local: the
 * repo's tsconfig lib (DOM) has no Web Bluetooth / Web Serial declarations,
 * and pulling a dependency for them would bloat the bundle for two
 * feature-detected calls. Only the members the driver uses are declared. */

type BluetoothDeviceLike = {
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{
        getCharacteristic(uuid: string): Promise<{
          startNotifications(): Promise<unknown>;
          stopNotifications(): Promise<unknown>;
          writeValue(data: BufferSource): Promise<void>;
          addEventListener(
            type: string,
            listener: (event: Event) => void,
          ): void;
          removeEventListener(
            type: string,
            listener: (event: Event) => void,
          ): void;
        }>;
      }>;
    } | null>;
  };
};

type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

import { ObdError, parseDtcResponseText, parseVinResponseText } from "../lib/dtc";
import {
  BleBridgeError,
  loadBleBridge,
  pickAdapterDevice,
  toBleError,
  type IMechanicBleBridge,
} from "../native/ble-bridge";
import type { ObdDriver, ObdScanResult, ObdTranscript, ObdTranscriptEntry } from "./driver";

/**
 * Pure log-accumulation helper (R3). Appends one timestamped
 * command → response exchange to the session log. Kept separate from the
 * driver so unit tests can exercise the log shape without hardware.
 */
export function appendTranscriptEntry(
  log: ObdTranscriptEntry[],
  command: string,
  response: string,
): ObdTranscriptEntry[] {
  log.push({ at: new Date().toISOString(), command, response });
  return log;
}

/* Many cheap ELM327 clones advertise Nordic UART (FFE0/FFE1) or the
 * SPP-style 0000fff0 service. Try each candidate pair in order. */
const BLE_CANDIDATES: Array<{ service: string; characteristic: string }> = [
  { service: "0000ffe0-0000-1000-8000-00805f9a34fb", characteristic: "0000ffe1-0000-1000-8000-00805f9a34fb" },
  { service: "0000fff0-0000-1000-8000-00805f9a34fb", characteristic: "0000fff1-0000-1000-8000-00805f9a34fb" },
];

const READ_TIMEOUT_MS = 8_000;
const WRITE_CHUNK_DELAY_MS = 30;
/** How long to look for OBD adapters before reporting that none answered. */
const NATIVE_SCAN_TIMEOUT_MS = 12_000;

/** One line-level transport over an ELM327 link. Exported for the S7 tests. */
export type LineTransport = {
  kind: "bluetooth" | "serial" | "native";
  name: string;
  writeLine(line: string): Promise<void>;
  readUntilPrompt(timeoutMs?: number): Promise<string>;
  close(): Promise<void>;
};

/** Byte-level line transport over a BLE UART characteristic. */
function bleTransport(
  device: BluetoothDeviceLike,
  characteristic: {
    startNotifications(): Promise<unknown>;
    stopNotifications(): Promise<unknown>;
    writeValue(data: BufferSource): Promise<void>;
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  },
): LineTransport {
  const decoder = new TextDecoder();
  let buffer = "";
  let waiter: ((text: string) => void) | null = null;

  function onNotify(event: Event) {
    const view = (event as unknown as { target?: { value?: ArrayBufferView } })
      .target?.value;
    if (!view) return;
    buffer += decoder.decode(view, { stream: true });
    const promptAt = buffer.indexOf(">");
    if (promptAt >= 0 && waiter) {
      const text = buffer.slice(0, promptAt + 1);
      buffer = buffer.slice(promptAt + 1);
      const w = waiter;
      waiter = null;
      w(text);
    }
  }

  return {
    kind: "bluetooth",
    name: device.name ?? "Bluetooth adapter",
    async writeLine(line: string) {
      const data = new TextEncoder().encode(`${line}\r`);
      await characteristic.writeValue(data);
      await new Promise((r) => setTimeout(r, WRITE_CHUNK_DELAY_MS));
    },
    readUntilPrompt(timeoutMs = READ_TIMEOUT_MS) {
      return new Promise<string>((resolve, reject) => {
        const promptAt = buffer.indexOf(">");
        if (promptAt >= 0) {
          const text = buffer.slice(0, promptAt + 1);
          buffer = buffer.slice(promptAt + 1);
          resolve(text);
          return;
        }
        waiter = resolve;
        setTimeout(() => {
          if (waiter) {
            waiter = null;
            reject(
              new ObdError(
                "The adapter stopped answering mid-scan.",
                "Keep the adapter plugged in with the ignition on and try connecting again.",
              ),
            );
          }
        }, timeoutMs);
      });
    },
    async close() {
      characteristic.removeEventListener(
        "characteristicvaluechanged",
        onNotify,
      );
      await characteristic.stopNotifications().catch(() => undefined);
      if (device.gatt?.connected) device.gatt.connect().catch(() => undefined);
      void onNotify;
    },
  };
}

/** Byte-level line transport over a Web Serial port. */
function serialTransport(port: SerialPortLike, name: string): LineTransport {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  // A single shared reader pump feeds every pending read in order — the
  // driver only ever has one command in flight.
  let pumpStarted = false;
  let pumpFailed: unknown = null;
  const waiters: Array<{
    resolve: (text: string) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  function drain() {
    const promptAt = buffer.indexOf(">");
    if (promptAt < 0 || waiters.length === 0) return;
    const text = buffer.slice(0, promptAt + 1);
    buffer = buffer.slice(promptAt + 1);
    const w = waiters.shift()!;
    clearTimeout(w.timer);
    w.resolve(text);
  }

  async function ensurePump() {
    if (pumpStarted) {
      if (pumpFailed) throw pumpFailed;
      return;
    }
    pumpStarted = true;
    if (!port.readable) {
      pumpFailed = new ObdError("Could not read from the serial port.");
      throw pumpFailed;
    }
    const reader = port.readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        drain();
      }
    } catch (err) {
      pumpFailed = err;
      while (waiters.length > 0) {
        const w = waiters.shift()!;
        clearTimeout(w.timer);
        w.reject(err);
      }
    } finally {
      reader.releaseLock();
    }
  }

  return {
    kind: "serial",
    name,
    async writeLine(line: string) {
      if (!port.writable) throw new ObdError("Could not write to the serial port.");
      await ensurePump();
      const writer = port.writable.getWriter();
      try {
        await writer.write(encoder.encode(`${line}\r`));
      } finally {
        writer.releaseLock();
      }
      await new Promise((r) => setTimeout(r, WRITE_CHUNK_DELAY_MS));
    },
    readUntilPrompt(timeoutMs = READ_TIMEOUT_MS) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.resolve === resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(
            new ObdError(
              "The adapter stopped answering mid-scan.",
              "Keep the adapter plugged in with the ignition on and try connecting again.",
            ),
          );
        }, timeoutMs);
        waiters.push({ resolve, reject, timer });
        drain();
      });
    },
    async close() {
      while (waiters.length > 0) {
        const w = waiters.shift()!;
        clearTimeout(w.timer);
        w.reject(new ObdError("Connection closed."));
      }
      try {
        await port.close();
      } catch {
        /* already closed — fine */
      }
    },
  };
}

/**
 * The three live transports. "native" is the app's own BLE bridge and is only
 * offered inside the Capacitor shell (see `browserCapabilities().native`), so
 * the scan screen never presents a choice that cannot work.
 */
export type LiveConnectChoice = "bluetooth" | "serial" | "native";

/**
 * The real adapter. Construct with an explicit transport choice — the scan
 * screen only offers choices the browser actually supports.
 */
export class LiveElmDriver implements ObdDriver {
  private transport: LineTransport | null = null;
  private readonly choice: LiveConnectChoice;
  /** Session transcript: timestamped command → raw-reply pairs (R3). */
  private transcriptLog: ObdTranscriptEntry[] = [];
  /**
   * A5 observers: called with each exchange as it is logged, so the scan screen
   * can show the adapter conversation while it happens instead of waiting for
   * `getTranscript()` at the end. Purely additive — what gets persisted to
   * `raw_json` is unchanged, and a listener that throws can never fail a scan.
   */
  private transcriptListeners = new Set<(entry: ObdTranscriptEntry) => void>();

  constructor(choice: LiveConnectChoice) {
    this.choice = choice;
  }

  get label(): string {
    return this.transport
      ? `ELM327 (${this.transport.name})`
      : "ELM327 adapter";
  }

  /**
   * The session transcript accumulated so far: transport type, adapter
   * identity, and every command → raw-reply exchange. Live-driver-specific —
   * the shared `ObdDriver` interface deliberately does not carry it (manual
   * entry and demo have no adapter to transcribe).
   */
  getTranscript(): ObdTranscript {
    const t = this.transport;
    return {
      transport: t?.kind ?? this.choice,
      adapter: t?.name ?? "ELM327 adapter",
      entries: [...this.transcriptLog],
    };
  }

  /** One command exchange, logged exactly as the adapter replied. */
  private async exchange(cmd: string): Promise<string> {
    const t = this.requireTransport();
    await t.writeLine(cmd);
    const reply = await t.readUntilPrompt();
    appendTranscriptEntry(this.transcriptLog, cmd, reply);
    const entry = this.transcriptLog[this.transcriptLog.length - 1]!;
    // Hand the observer its own copy: the UI holds these in state, and the
    // persisted log is the driver's. Nothing mutates either.
    this.emitTranscript({ ...entry });
    return reply;
  }

  /**
   * Subscribe to the transcript as it grows. Returns an unsubscribe function —
   * call it when the scan finishes (the screen does, in its `finally`).
   *
   * A5: this is the only new surface on the driver. `getTranscript()` still
   * returns the whole session and is still what `saveScan` persists.
   */
  onTranscriptEntry(listener: (entry: ObdTranscriptEntry) => void): () => void {
    this.transcriptListeners.add(listener);
    return () => {
      this.transcriptListeners.delete(listener);
    };
  }

  private emitTranscript(entry: ObdTranscriptEntry): void {
    for (const listener of [...this.transcriptListeners]) {
      try {
        listener(entry);
      } catch {
        /* A rendering bug must never turn into a failed scan. */
      }
    }
  }

  async connect(): Promise<void> {
    this.transport =
      this.choice === "bluetooth"
        ? await connectBluetooth()
        : this.choice === "serial"
          ? await connectSerial()
          : await connectNativeBle();
    this.transcriptLog = [];
    // ELM327 handshake: reset, echo off, headers off, then prove the car answers.
    const replies: Record<string, string> = {};
    for (const cmd of ["ATZ", "ATE0", "ATH0", "0100"] as const) {
      replies[cmd] = await this.exchange(cmd);
    }
    if (/\b(UNABLE TO CONNECT|NO SYNC|BUS BUSY|BUS ERROR)\b/.test(replies["0100"]!.toUpperCase())) {
      const t = this.transport;
      this.transport = null;
      await t.close();
      throw new ObdError(
        "The adapter answered, but the car did not.",
        "Check the ignition is on (engine can stay off) and the adapter is firmly seated in the OBD2 port.",
      );
    }
  }

  async readCodes(): Promise<ObdScanResult> {
    const codes: ObdScanResult["codes"] = [];
    for (const [mode, status] of [
      ["03", "stored"],
      ["07", "pending"],
      ["0A", "permanent"],
    ] as const) {
      const reply = await this.exchange(mode);
      for (const code of parseDtcResponseText(reply, mode)) {
        codes.push({ code, status });
      }
    }
    let vin: string | null = null;
    try {
      vin = parseVinResponseText(await this.exchange("0902"));
    } catch {
      vin = null; // VIN is a bonus — a car that won't report it still scans.
    }
    return { codes, vin, transcript: this.getTranscript() };
  }

  async clearCodes(): Promise<void> {
    await this.exchange("04");
    // Service 04 has no parseable payload to verify against — the re-scan
    // (S5 "Verify") is the honest confirmation that the codes are gone.
  }

  async disconnect(): Promise<void> {
    const t = this.transport;
    this.transport = null;
    if (t) await t.close();
  }

  private requireTransport(): LineTransport {
    if (!this.transport) throw new ObdError("The adapter is not connected.");
    return this.transport;
  }
}

async function connectBluetooth(): Promise<LineTransport> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice(options: {
        acceptAllDevices: boolean;
        optionalServices: string[];
      }): Promise<BluetoothDeviceLike>;
    };
  };
  if (!nav.bluetooth) {
    throw new ObdError("This browser cannot do Bluetooth OBD connections.", liveHint());
  }
  let device: BluetoothDeviceLike;
  try {
    device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_CANDIDATES.map((c) => c.service),
    });
  } catch (err) {
    if ((err as Error)?.name === "NotFoundError") {
      throw new ObdError("No adapter was chosen.", liveHint());
    }
    throw new ObdError("The Bluetooth connection was cancelled or failed.", liveHint());
  }
  if (!device.gatt) throw new ObdError("That device does not offer Bluetooth GATT.", liveHint());
  const server = await device.gatt.connect().catch(() => null);
  if (!server) throw new ObdError("Could not open the adapter's Bluetooth link.", liveHint());
  for (const candidate of BLE_CANDIDATES) {
    try {
      const service = await server.getPrimaryService(candidate.service);
      const characteristic = await service.getCharacteristic(candidate.characteristic);
      await characteristic.startNotifications();
      return bleTransport(device, characteristic);
    } catch {
      /* try the next candidate pair */
    }
  }
  throw new ObdError(
    "Connected over Bluetooth, but found no OBD data channel on the adapter.",
    "Many cheap clones expose the Nordic UART service — if yours needs a PIN, pair it in the phone's Bluetooth settings first.",
  );
}

async function connectSerial(): Promise<LineTransport> {
  const nav = navigator as Navigator & {
    serial?: {
      requestPort(): Promise<SerialPortLike>;
    };
  };
  if (!nav.serial) {
    throw new ObdError("This browser cannot do USB-serial OBD connections.", liveHint());
  }
  let port: SerialPortLike;
  try {
    port = await nav.serial.requestPort();
  } catch (err) {
    if ((err as Error)?.name === "NotFoundError") {
      throw new ObdError("No adapter was chosen.", liveHint());
    }
    throw new ObdError("The serial connection was cancelled or failed.", liveHint());
  }
  // ELM327 USB clones run 38400 baud by default.
  await port.open({ baudRate: 38400 }).catch(() => {
    throw new ObdError("Could not open the adapter's serial port.", liveHint());
  });
  return serialTransport(port, "USB adapter");
}

function liveHint(): string | null {
  return "Demo mode works everywhere with no hardware, or type a code in manually.";
}

/* ------------------------------------------------------------------ *
 * Native BLE transport (Slice S7) — the Capacitor iOS/Android bridge
 * ------------------------------------------------------------------ */

/**
 * The slice of the bridge the line transport actually needs. Kept separate so
 * the transport can be exercised with a fake bridge in tests — no phone, no
 * Capacitor, no car.
 */
export type NativeBleWriteBridge = Pick<
  IMechanicBleBridge,
  "write" | "disconnect"
>;

/** Belt-and-braces guard: even a broken native side must not hang the UI. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => ObdError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Byte-level line transport over the app's own native BLE bridge.
 *
 * The bridge's `write()` already round-trips one command to the adapter's
 * reply, so `writeLine()` performs that exchange and `readUntilPrompt()`
 * hands the buffered answer back — the same write-then-read order the web
 * transports use, which keeps the ELM327 driver identical across all three.
 *
 * A reply that arrived without the ELM327 prompt (`complete: false`) is
 * reported as a lost link, never as a successful read: an empty answer parsed
 * as "no codes" would be a fabricated scan.
 */
export function nativeBleTransport(
  bridge: NativeBleWriteBridge,
  device: { deviceId: string; name: string | null },
  options: { timeoutMs?: number } = {},
): LineTransport {
  const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;
  let pending: Promise<{ response: string; complete: boolean }> | null = null;
  let closed = false;

  const lostLink = () =>
    new ObdError(
      "The adapter stopped answering mid-scan.",
      "Keep the adapter plugged in with the ignition on and try connecting again.",
    );

  return {
    kind: "native",
    name: device.name ?? device.deviceId,

    async writeLine(line: string) {
      if (closed) {
        throw new ObdError("The adapter is not connected.", liveHint());
      }
      const roundTrip = withTimeout(
        bridge.write({ command: line, timeoutMs }),
        // Slightly longer than the native timeout, so the native (more
        // specific) error wins whenever the native side is healthy.
        timeoutMs + 2_000,
        lostLink,
      );
      pending = roundTrip;
      try {
        await roundTrip;
      } catch (err) {
        pending = null;
        throw nativeBleError(err);
      }
    },

    async readUntilPrompt() {
      const roundTrip = pending;
      pending = null;
      if (!roundTrip) {
        throw new ObdError("No command is waiting for a reply.", liveHint());
      }
      let result: { response: string; complete: boolean };
      try {
        result = await roundTrip;
      } catch (err) {
        throw nativeBleError(err);
      }
      if (!result.complete) throw lostLink();
      return result.response;
    },

    async close() {
      closed = true;
      pending = null;
      await bridge.disconnect().catch(() => undefined);
    },
  };
}

/** Turn a bridge failure into the driver's user-facing error + hint. */
function nativeBleError(err: unknown): ObdError {
  if (err instanceof ObdError) return err;
  const failure = toBleError(err);
  switch (failure.code) {
    case "NOT_NATIVE":
    case "PLUGIN_UNAVAILABLE":
      return new ObdError(
        "The app's Bluetooth bridge is not available in this build.",
        liveHint(),
      );
    case "NOT_SUPPORTED":
      return new ObdError(
        "This phone has no usable Bluetooth LE radio.",
        "Turn Bluetooth on and try again — or use demo mode, which needs no hardware.",
      );
    case "PERMISSION_DENIED":
      return new ObdError(
        "iMechanic is not allowed to use Bluetooth.",
        "Allow Bluetooth for iMechanic in your phone's settings, then try again.",
      );
    case "PERMISSION_PENDING":
      return new ObdError(
        "iMechanic is still waiting for Bluetooth permission.",
        "Tap Allow on the Bluetooth prompt, then try connecting again.",
      );
    case "NO_DEVICE":
      return new ObdError(
        "No Bluetooth OBD adapter was found.",
        "Plug the adapter into the OBD2 port, switch the ignition on, keep it near the phone, then try again.",
      );
    case "NOT_CONNECTED":
      return new ObdError("The adapter is not connected.", liveHint());
    case "TIMEOUT":
      return new ObdError(
        "The adapter stopped answering mid-scan.",
        "Keep the adapter plugged in with the ignition on and try connecting again.",
      );
    case "DISCONNECTED":
      return new ObdError(
        "The adapter's Bluetooth link dropped.",
        "Bring the phone back near the adapter and try connecting again.",
      );
    case "CONNECT_FAILED":
      return new ObdError(
        "Could not open the adapter's Bluetooth link.",
        "Some cheap clones must be paired in the phone's Bluetooth settings first. If another app is already connected to the adapter, close it and try again.",
      );
    default:
      return new ObdError(failure.message, liveHint());
  }
}

/**
 * How many times we ask the native bridge for a permission decision. iOS
 * answers `requestPermissions` honestly: "prompt" means **the system dialog is
 * still on screen**, not "granted". Treating "prompt" as consent used to send
 * us straight into `scan()`, which could only fail with "Bluetooth is switched
 * off" — a confusing error that blamed the user's radio for a permission the
 * user had not answered yet.
 *
 * Asking again re-reads the OS state, so an answer that lands while we wait is
 * picked up immediately. Bounded, so the connect step can never hang.
 */
const NATIVE_PERMISSION_ATTEMPTS = 3;
/** Pause between asks: long enough to be a real wait, short enough to stay alive. */
const NATIVE_PERMISSION_RETRY_MS = 1_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve a native Bluetooth permission to "granted", or fail with the honest
 * reason: denied, no radio, or still unanswered after the final ask. Never
 * reports a pending prompt as a decision either way.
 */
async function awaitNativeBlePermission(bridge: IMechanicBleBridge): Promise<void> {
  for (let attempt = 1; attempt <= NATIVE_PERMISSION_ATTEMPTS; attempt += 1) {
    const { bluetooth } = await bridge.requestPermissions();
    if (bluetooth === "granted") return;
    if (bluetooth === "denied") {
      throw new BleBridgeError("PERMISSION_DENIED", "Bluetooth permission denied");
    }
    if (bluetooth === "unsupported") {
      throw new BleBridgeError("NOT_SUPPORTED", "No Bluetooth LE radio");
    }
    if (attempt < NATIVE_PERMISSION_ATTEMPTS) await delay(NATIVE_PERMISSION_RETRY_MS);
  }
  throw new BleBridgeError(
    "PERMISSION_PENDING",
    "The Bluetooth permission prompt is still waiting for an answer.",
  );
}

/**
 * Permission → scan → connect through the native bridge, returning the line
 * transport the driver then drives. Every failure is an ObdError whose copy
 * matches the failure (never a generic "something went wrong"), and nothing
 * here can hang or invent an answer.
 */
async function connectNativeBle(): Promise<LineTransport> {
  let bridge: IMechanicBleBridge;
  try {
    bridge = await loadBleBridge();
  } catch (err) {
    throw nativeBleError(err);
  }
  try {
    await awaitNativeBlePermission(bridge);
    const { devices } = await bridge.scan({ timeoutMs: NATIVE_SCAN_TIMEOUT_MS });
    const device = pickAdapterDevice(devices);
    if (!device) throw new BleBridgeError("NO_DEVICE", "No adapter found");
    await bridge.connect({ deviceId: device.deviceId });
    return nativeBleTransport(bridge, device);
  } catch (err) {
    throw nativeBleError(err);
  }
}
