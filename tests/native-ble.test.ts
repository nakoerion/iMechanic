/**
 * Slice S7 — the native BLE bridge and its integration into the live driver.
 *
 * Pure unit tests: no phone, no Capacitor runtime, no car. The native side is
 * faked at the seam the driver actually uses (`write`/`disconnect`), so these
 * tests prove the honest-error behaviour the product depends on: a missing
 * bridge, a denied permission, a lost link and a silent adapter all fail
 * loudly and never hang or come back empty-but-successful.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BleBridgeError,
  describeBleState,
  loadBleBridge,
  pickAdapterDevice,
  toBleError,
  type BleDevice,
} from "../src/native/ble-bridge";
import {
  isBlePluginAvailable,
  isNativeRuntime,
  nativePlatform,
} from "../src/native/runtime";
import { browserCapabilities } from "../src/obd/driver";
import {
  LiveElmDriver,
  nativeBleTransport,
  type NativeBleWriteBridge,
} from "../src/obd/elm327-live";

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
  delete g.Capacitor;
});

afterEach(() => {
  if (navigatorDescriptor) {
    Object.defineProperty(g, "navigator", navigatorDescriptor);
  } else {
    delete g.navigator;
  }
  delete g.Capacitor;
});

/** A shell that looks like the real Capacitor runtime. */
function fakeCapacitor(options: { pluginAvailable?: boolean } = {}) {
  return {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
    isPluginAvailable: () => options.pluginAvailable ?? true,
  };
}

/* ------------------------------------------------------------------ *
 * Runtime detection
 * ------------------------------------------------------------------ */

describe("native runtime detection", () => {
  it("reports web when no Capacitor runtime is injected", () => {
    expect(nativePlatform()).toBe("web");
    expect(isNativeRuntime()).toBe(false);
    expect(isBlePluginAvailable()).toBe(false);
  });

  it("reports the shell platform when Capacitor is injected", () => {
    setGlobal("Capacitor", {
      getPlatform: () => "android",
      isNativePlatform: () => true,
    });
    expect(nativePlatform()).toBe("android");
    expect(isNativeRuntime()).toBe(true);
    // No isPluginAvailable → optimistic, so a missing plugin fails loudly.
    expect(isBlePluginAvailable()).toBe(true);
  });

  it("treats a stubbed but non-native bridge as web", () => {
    setGlobal("Capacitor", {
      getPlatform: () => "web",
      isNativePlatform: () => false,
    });
    expect(isNativeRuntime()).toBe(false);
  });

  it("never throws when the injected object is hostile", () => {
    setGlobal("Capacitor", {
      isNativePlatform: () => {
        throw new Error("boom");
      },
      isPluginAvailable: () => {
        throw new Error("boom");
      },
    });
    expect(isNativeRuntime()).toBe(false);
  });
});

describe("browserCapabilities", () => {
  it("reports nothing available without a navigator (SSR)", () => {
    delete g.navigator;
    expect(browserCapabilities()).toEqual({
      bluetooth: false,
      serial: false,
      native: false,
    });
  });

  it("keeps the pre-S7 web behaviour untouched in a browser", () => {
    setGlobal("navigator", { bluetooth: {} });
    expect(browserCapabilities()).toEqual({
      bluetooth: true,
      serial: false,
      native: false,
    });
    setGlobal("navigator", { serial: {} });
    expect(browserCapabilities()).toEqual({
      bluetooth: false,
      serial: true,
      native: false,
    });
  });

  it("adds the native transport only inside the shell", () => {
    // iOS Safari: no Web Bluetooth, no Web Serial — the shell's bridge is the
    // only way to reach a real adapter.
    setGlobal("navigator", {});
    setGlobal("Capacitor", fakeCapacitor());
    expect(browserCapabilities()).toEqual({
      bluetooth: false,
      serial: false,
      native: true,
    });
    // A browser cannot claim the native transport.
    delete g.navigator;
    delete g.Capacitor;
    expect(browserCapabilities().native).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Bridge loading
 * ------------------------------------------------------------------ */

describe("loadBleBridge", () => {
  it("fails honestly outside a native shell", async () => {
    await expect(loadBleBridge()).rejects.toMatchObject({
      name: "BleBridgeError",
      code: "NOT_NATIVE",
    });
  });

  it("fails honestly when the plugin is not registered", async () => {
    setGlobal("Capacitor", fakeCapacitor({ pluginAvailable: false }));
    await expect(loadBleBridge()).rejects.toMatchObject({
      code: "PLUGIN_UNAVAILABLE",
    });
  });
});

/* ------------------------------------------------------------------ *
 * Error mapping
 * ------------------------------------------------------------------ */

describe("toBleError", () => {
  it("passes BleBridgeError through unchanged", () => {
    const original = new BleBridgeError("TIMEOUT", "slow");
    expect(toBleError(original)).toBe(original);
  });

  it("keeps native codes", () => {
    const mapped = toBleError({ code: "PERMISSION_DENIED", message: "nope" });
    expect(mapped.code).toBe("PERMISSION_DENIED");
    expect(mapped.message).toBe("nope");
  });

  it("recognises an unregistered plugin by its message", () => {
    const mapped = toBleError(
      new Error('"iMechanicBle" plugin is not implemented on ios'),
    );
    expect(mapped.code).toBe("PLUGIN_UNAVAILABLE");
  });

  it("maps anything else to UNKNOWN without inventing a code", () => {
    expect(toBleError(new Error("kaboom")).code).toBe("UNKNOWN");
    expect(toBleError(undefined).code).toBe("UNKNOWN");
  });
});

/* ------------------------------------------------------------------ *
 * Adapter selection
 * ------------------------------------------------------------------ */

describe("pickAdapterDevice", () => {
  const devices: BleDevice[] = [
    { deviceId: "aa", name: "AirPods Pro", rssi: -40 },
    { deviceId: "bb", name: "OBDII", rssi: -80 },
    { deviceId: "cc", name: "ELM327 v1.5", rssi: -60 },
    { deviceId: "dd", name: null, rssi: -30 },
  ];

  it("returns null when nothing answered", () => {
    expect(pickAdapterDevice([])).toBeNull();
  });

  it("prefers a named OBD adapter over a stronger unknown signal", () => {
    expect(pickAdapterDevice(devices)?.deviceId).toBe("cc");
  });

  it("honours an explicitly requested device", () => {
    expect(pickAdapterDevice(devices, "aa")?.deviceId).toBe("aa");
  });

  it("falls back to an unknown-but-named device before an unnamed one", () => {
    const unknown: BleDevice[] = [
      { deviceId: "dd", name: null, rssi: -30 },
      { deviceId: "ee", name: "My Gadget", rssi: -90 },
    ];
    expect(pickAdapterDevice(unknown)?.deviceId).toBe("ee");
  });

  it("breaks ties on signal strength", () => {
    const two: BleDevice[] = [
      { deviceId: "x", name: "OBD2", rssi: -95 },
      { deviceId: "y", name: "Vgate iCar Pro", rssi: -55 },
    ];
    expect(pickAdapterDevice(two)?.deviceId).toBe("y");
  });
});

describe("describeBleState", () => {
  it("names the adapter when connected and stays plain otherwise", () => {
    expect(
      describeBleState({
        state: "connected",
        deviceId: "x",
        deviceName: "OBDII",
      }),
    ).toBe("Connected to OBDII");
    expect(
      describeBleState({ state: "disconnected", deviceId: null, deviceName: null }),
    ).toBe("Not connected");
    expect(describeBleState({ state: "scanning", deviceId: null, deviceName: null })).toBe(
      "Looking for adapters…",
    );
  });
});

/* ------------------------------------------------------------------ *
 * The native line transport
 * ------------------------------------------------------------------ */

type WriteCall = { command: string; timeoutMs?: number };

/** A fake native bridge: records the calls the transport makes. */
function fakeBridge(
  reply: (call: WriteCall) => Promise<{ response: string; complete: boolean }>,
): {
  bridge: NativeBleWriteBridge;
  calls: WriteCall[];
  counters: { disconnects: number };
} {
  const calls: WriteCall[] = [];
  const counters = { disconnects: 0 };
  return {
    calls,
    counters,
    bridge: {
      write(call) {
        calls.push(call);
        return reply(call);
      },
      async disconnect() {
        counters.disconnects += 1;
      },
    },
  };
}

describe("nativeBleTransport", () => {
  it("round-trips a command and returns the raw reply", async () => {
    const { bridge, calls, counters } = fakeBridge(async () => ({
      response: "41 00 BE 3E B8 13\r>",
      complete: true,
    }));
    const transport = nativeBleTransport(bridge, {
      deviceId: "bb",
      name: "OBDII",
    });
    expect(transport.kind).toBe("native");
    expect(transport.name).toBe("OBDII");
    await transport.writeLine("0100");
    expect(await transport.readUntilPrompt()).toBe("41 00 BE 3E B8 13\r>");
    expect(calls).toEqual([{ command: "0100", timeoutMs: 8_000 }]);
    await transport.close();
    expect(counters.disconnects).toBe(1);
  });

  it("uses the device id as the label when the adapter has no name", async () => {
    const { bridge } = fakeBridge(async () => ({ response: ">", complete: true }));
    const transport = nativeBleTransport(bridge, { deviceId: "aa:bb", name: null });
    expect(transport.name).toBe("aa:bb");
  });

  it("treats a prompt-less reply as a lost link, never as an empty scan", async () => {
    const { bridge } = fakeBridge(async () => ({ response: "41 00", complete: false }));
    const transport = nativeBleTransport(bridge, { deviceId: "bb", name: "OBDII" });
    await transport.writeLine("0100");
    await expect(transport.readUntilPrompt()).rejects.toMatchObject({
      message: expect.stringContaining("stopped answering"),
    });
  });

  it("maps native codes onto user-facing driver errors", async () => {
    const cases: Array<[string, RegExp]> = [
      ["PERMISSION_DENIED", /not allowed to use Bluetooth/],
      ["NO_DEVICE", /No Bluetooth OBD adapter was found/],
      ["DISCONNECTED", /link dropped/],
      ["NOT_CONNECTED", /not connected/],
      ["TIMEOUT", /stopped answering/],
      ["CONNECT_FAILED", /Could not open the adapter's Bluetooth link/],
      ["NOT_SUPPORTED", /no usable Bluetooth LE radio/],
    ];
    for (const [code, expected] of cases) {
      const { bridge } = fakeBridge(() => {
        const err = Object.assign(new Error(code), { code });
        return Promise.reject(err);
      });
      const transport = nativeBleTransport(bridge, {
        deviceId: "bb",
        name: "OBDII",
      });
      await expect(transport.writeLine("ATZ")).rejects.toThrow(expected);
    }
  });

  it("refuses to write once closed", async () => {
    const { bridge } = fakeBridge(async () => ({ response: ">", complete: true }));
    const transport = nativeBleTransport(bridge, { deviceId: "bb", name: "OBDII" });
    await transport.close();
    await expect(transport.writeLine("ATZ")).rejects.toMatchObject({
      message: expect.stringContaining("not connected"),
    });
  });

  it("refuses to read when no command is in flight", async () => {
    const { bridge } = fakeBridge(async () => ({ response: ">", complete: true }));
    const transport = nativeBleTransport(bridge, { deviceId: "bb", name: "OBDII" });
    await expect(transport.readUntilPrompt()).rejects.toMatchObject({
      message: expect.stringContaining("No command is waiting"),
    });
  });

  it("never hangs when the bridge stops answering entirely", async () => {
    // A bridge that never settles: the JS watchdog has to cut it off.
    const { bridge } = fakeBridge(() => new Promise(() => {}));
    const transport = nativeBleTransport(
      bridge,
      { deviceId: "bb", name: "OBDII" },
      { timeoutMs: 20 },
    );
    await expect(transport.writeLine("ATZ")).rejects.toMatchObject({
      message: expect.stringContaining("stopped answering"),
    });
  });
});

/* ------------------------------------------------------------------ *
 * Driver integration
 * ------------------------------------------------------------------ */

describe("LiveElmDriver over the native bridge", () => {
  it("labels the transcript transport as native before connecting", () => {
    const driver = new LiveElmDriver("native");
    expect(driver.getTranscript()).toEqual({
      transport: "native",
      adapter: "ELM327 adapter",
      entries: [],
    });
  });

  it("fails with an honest error when the bridge is not in this build", async () => {
    // A plain browser / the server: no Capacitor runtime at all.
    const driver = new LiveElmDriver("native");
    await expect(driver.connect()).rejects.toMatchObject({
      message: expect.stringContaining("bridge is not available"),
    });
    // ...and it must be safe to disconnect afterwards.
    await expect(driver.disconnect()).resolves.toBeUndefined();
  });

  it("fails with an honest error when the plugin is registered but missing", async () => {
    setGlobal("Capacitor", fakeCapacitor({ pluginAvailable: false }));
    const driver = new LiveElmDriver("native");
    await expect(driver.connect()).rejects.toMatchObject({
      message: expect.stringContaining("bridge is not available"),
    });
  });
});
