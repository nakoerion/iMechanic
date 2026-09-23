/**
 * Web Bluetooth receive path — the S3 defect fix.
 *
 * The BLE transport's `characteristicvaluechanged` listener was only ever
 * *removed* (in `close()`) and never added, so a real adapter's replies were
 * dropped on the floor: the buffer stayed empty and every
 * `readUntilPrompt()` waited out its full 8s timeout. A Web Bluetooth scan
 * could not get past its first `ATZ` — while Web Serial (a reader pump) and
 * the native bridge (`write()` round-trips) were unaffected.
 *
 * These tests drive the BLE path with a fake characteristic that actually
 * fires `characteristicvaluechanged` events — the Web Bluetooth mirror of the
 * Web Serial fake in `scan-ignition.test.ts` — and prove:
 *
 *   1. a whole connect + read scan completes over a notifying adapter;
 *   2. replies reassembled from several BLE-sized packets (20-byte ATT
 *      payload, as a real cheap clone sends them) are correct, not truncated;
 *   3. the transport subscribes and starts notifications itself, and tears
 *      both down symmetrically on `close()`;
 *   4. an adapter that never notifies still fails honestly, with the
 *      lost-link error rather than an empty-but-successful scan.
 *
 * No hardware, no database, no Capacitor.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveElmDriver, bleTransport } from "../src/obd/elm327-live";
import { demoDatasetAsElmResponse } from "../src/obd/demo-simulator";

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
 * A fake ELM327 over Web Bluetooth
 * ------------------------------------------------------------------ */

/** The adapter's answers, exactly as a real ELM327 sends them. */
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

const HANDSHAKE = ["ATZ", "ATE0", "ATH0", "0100"];
const READ_SERVICES = ["03", "07", "0A", "0902"];

type FakeBleAdapter = {
  writes: string[];
  /** How many listeners are attached to `characteristicvaluechanged`. */
  listenerCount(): number;
  starts(): number;
  stops(): number;
  characteristic: {
    startNotifications(): Promise<void>;
    stopNotifications(): Promise<void>;
    writeValue(data: BufferSource): Promise<void>;
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  };
};

/**
 * A fake BLE adapter. Commands land on `writeValue`; the answer comes back as
 * `characteristicvaluechanged` events, delivered asynchronously and split into
 * `chunk`-byte packets (the 20-byte default ATT payload unless overridden),
 * which is how a real adapter notifies.
 */
function fakeBleAdapter(
  options: { silent?: boolean; chunk?: number } = {},
): FakeBleAdapter & { device: Parameters<typeof bleTransport>[0] } {
  const chunkSize = options.chunk ?? 20;
  const writes: string[] = [];
  const listeners = new Set<(event: Event) => void>();
  let starts = 0;
  let stops = 0;

  const characteristic = {
    async startNotifications() {
      starts += 1;
    },
    async stopNotifications() {
      stops += 1;
    },
    async writeValue(data: BufferSource) {
      const command = new TextDecoder().decode(data).trim();
      writes.push(command);
      if (options.silent || !listeners.size) return;
      const bytes = new TextEncoder().encode(adapterReply(command));
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const packet = bytes.slice(i, i + chunkSize);
        // One notification per packet, later in the task queue — never
        // inside the write, which is what a radio does.
        void Promise.resolve().then(() => {
          const event = {
            target: { value: packet },
          } as unknown as Event;
          for (const listener of [...listeners]) listener(event);
        });
      }
    },
    addEventListener(type: string, listener: (event: Event) => void) {
      if (type === "characteristicvaluechanged") listeners.add(listener);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      if (type === "characteristicvaluechanged") listeners.delete(listener);
    },
  };

  const server = {
    async getPrimaryService() {
      return {
        async getCharacteristic() {
          return characteristic;
        },
      };
    },
  };
  const device = {
    name: "OBDII",
    gatt: {
      connected: true,
      async connect() {
        return server;
      },
    },
  };

  setGlobal("navigator", {
    bluetooth: {
      async requestDevice() {
        return device;
      },
    },
  });

  return {
    writes,
    listenerCount: () => listeners.size,
    starts: () => starts,
    stops: () => stops,
    characteristic,
    device,
  };
}

describe("Web Bluetooth notifications (S3 defect)", () => {
  it("completes a full scan over an adapter that notifies", async () => {
    const adapter = fakeBleAdapter();
    const driver = new LiveElmDriver("bluetooth");

    await driver.connect();
    // Connected over BLE: the value-event listener is attached, which is what
    // the defect removed — and therefore what the replies depend on.
    expect(adapter.listenerCount()).toBe(1);
    const result = await driver.readCodes();
    const log = driver.getTranscript();
    await driver.disconnect();

    // Every command reached the adapter and every reply was read back.
    expect(adapter.writes).toEqual([...HANDSHAKE, ...READ_SERVICES]);
    expect(log.transport).toBe("bluetooth");
    expect(log.adapter).toBe("OBDII");
    expect(log.entries.map((e) => e.command)).toEqual([
      ...HANDSHAKE,
      ...READ_SERVICES,
    ]);
    expect(log.entries[0]!.response).toBe("ATZ\rELM327 v1.5\r\r>");
    expect(result.codes.map((c) => c.code)).toEqual([
      "P0420",
      "P0171",
      "P0301",
      "P0442",
    ]);
    // NO DATA for the VIN stays an honest null.
    expect(result.vin).toBeNull();

    // Notifications were started (the connect probe and/or the transport) and
    // the listener was attached while the link was up.
    expect(adapter.starts()).toBeGreaterThan(0);
    // `close()` is the mirror of subscribing: listener off, notifications off.
    expect(adapter.listenerCount()).toBe(0);
    expect(adapter.stops()).toBe(1);
  });

  it("finishes well inside the read timeout instead of waiting it out", async () => {
    fakeBleAdapter();
    const started = Date.now();
    const driver = new LiveElmDriver("bluetooth");
    await driver.connect();
    await driver.readCodes();
    await driver.disconnect();

    // Seven exchanges at ~30ms write spacing. The pre-fix behaviour was an
    // 8s timeout on the first read, so a generous 2s ceiling still proves the
    // receive path is live.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("reassembles a reply split across BLE-sized packets", async () => {
    // 4-byte packets: every reply arrives as several notifications, so the
    // buffer has to accumulate across events before the prompt lands.
    const adapter = fakeBleAdapter({ chunk: 4 });
    const driver = new LiveElmDriver("bluetooth");
    await driver.connect();
    // The transport subscribed to the characteristic's value events.
    expect(adapter.listenerCount()).toBe(1);
    const result = await driver.readCodes();
    const entries = driver.getTranscript().entries;
    await driver.disconnect();

    expect(entries[0]!.response).toBe("ATZ\rELM327 v1.5\r\r>");
    expect(entries.find((e) => e.command === "0100")!.response).toBe(
      "41 00 BE 3E B8 13\r>",
    );
    expect(result.codes.map((c) => c.code)).toEqual([
      "P0420",
      "P0171",
      "P0301",
      "P0442",
    ]);
  });

  it("subscribes and starts notifications on its own, then tears both down", async () => {
    const adapter = fakeBleAdapter();
    // Built directly, without `connectBluetooth()`'s candidate probe.
    const transport = bleTransport(adapter.device, adapter.characteristic);

    expect(adapter.listenerCount()).toBe(1);

    await transport.writeLine("ATZ");
    expect(adapter.starts()).toBe(1);
    await expect(transport.readUntilPrompt(500)).resolves.toBe(
      "ATZ\rELM327 v1.5\r\r>",
    );

    // A second command must not restart notifications.
    await transport.writeLine("ATE0");
    expect(adapter.starts()).toBe(1);
    await expect(transport.readUntilPrompt(500)).resolves.toBe("OK\r>");

    await transport.close();
    expect(adapter.listenerCount()).toBe(0);
    expect(adapter.stops()).toBe(1);
  });

  it("fails honestly when the adapter never notifies", async () => {
    const adapter = fakeBleAdapter({ silent: true });
    const transport = bleTransport(adapter.device, adapter.characteristic);

    await transport.writeLine("ATZ");
    // The buffer stays empty: a lost link, never an empty-but-successful read.
    await expect(transport.readUntilPrompt(60)).rejects.toThrow(
      /stopped answering mid-scan/,
    );
    await transport.close();
  });
});
