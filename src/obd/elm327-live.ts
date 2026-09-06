/**
 * Live ELM327 driver (Slice S3) — Web Bluetooth + Web Serial, best effort.
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
 * Where neither transport exists (iOS Safari), the scan screen reads
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
import type { ObdDriver, ObdScanResult } from "./driver";

/* Many cheap ELM327 clones advertise Nordic UART (FFE0/FFE1) or the
 * SPP-style 0000fff0 service. Try each candidate pair in order. */
const BLE_CANDIDATES: Array<{ service: string; characteristic: string }> = [
  { service: "0000ffe0-0000-1000-8000-00805f9a34fb", characteristic: "0000ffe1-0000-1000-8000-00805f9a34fb" },
  { service: "0000fff0-0000-1000-8000-00805f9a34fb", characteristic: "0000fff1-0000-1000-8000-00805f9a34fb" },
];

const READ_TIMEOUT_MS = 8_000;
const WRITE_CHUNK_DELAY_MS = 30;

type LineTransport = {
  kind: "bluetooth" | "serial";
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

export type LiveConnectChoice = "bluetooth" | "serial";

/**
 * The real adapter. Construct with an explicit transport choice — the scan
 * screen only offers choices the browser actually supports.
 */
export class LiveElmDriver implements ObdDriver {
  private transport: LineTransport | null = null;
  private readonly choice: LiveConnectChoice;

  constructor(choice: LiveConnectChoice) {
    this.choice = choice;
  }

  get label(): string {
    return this.transport
      ? `ELM327 (${this.transport.name})`
      : "ELM327 adapter";
  }

  async connect(): Promise<void> {
    this.transport =
      this.choice === "bluetooth"
        ? await connectBluetooth()
        : await connectSerial();
    // ELM327 handshake: reset, echo off, headers off, then prove the car answers.
    const replies: Record<string, string> = {};
    for (const cmd of ["ATZ", "ATE0", "ATH0", "0100"] as const) {
      await this.transport.writeLine(cmd);
      replies[cmd] = await this.transport.readUntilPrompt();
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
    const t = this.requireTransport();
    const codes: ObdScanResult["codes"] = [];
    for (const [mode, status] of [
      ["03", "stored"],
      ["07", "pending"],
      ["0A", "permanent"],
    ] as const) {
      await t.writeLine(mode);
      const reply = await t.readUntilPrompt();
      for (const code of parseDtcResponseText(reply, mode)) {
        codes.push({ code, status });
      }
    }
    let vin: string | null = null;
    try {
      await t.writeLine("0902");
      vin = parseVinResponseText(await t.readUntilPrompt());
    } catch {
      vin = null; // VIN is a bonus — a car that won't report it still scans.
    }
    return { codes, vin };
  }

  async clearCodes(): Promise<void> {
    const t = this.requireTransport();
    await t.writeLine("04");
    await t.readUntilPrompt();
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
