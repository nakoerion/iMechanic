/**
 * `iMechanicBle` — the native BLE bridge behind the app's third transport
 * (slice S7). Client-side ONLY.
 *
 * On Android Chrome the web app can talk to an ELM327 adapter through Web
 * Bluetooth. **iOS Safari cannot** — so on iPhone the adapter is reached via
 * this plugin, implemented in CoreBluetooth (`ios/App/App/Plugins/
 * IMechanicBlePlugin.swift`) and in the Android BLE stack
 * (`android/app/src/main/java/app/imechanic/ble/IMechanicBlePlugin.kt`).
 *
 * The JS surface below is the single contract all three sides agree on. The
 * two native files implement exactly these method names and payload keys; if
 * you change one, change all three (see `native/README.md`).
 *
 * Honesty rules this module enforces:
 *  - every failure rejects with a `BleBridgeError` carrying a code, never a
 *    silent hang and never a fabricated success;
 *  - if the runtime is not a native shell, or the plugin is not registered,
 *    the error says exactly that instead of pretending Bluetooth is missing;
 *  - all Capacitor imports are lazy, so the plain web bundle never loads them.
 */
import { isBlePluginAvailable, isNativeRuntime, nativePlatform } from "./runtime";

/** One BLE peripheral seen while scanning. */
export type BleDevice = {
  /** Platform handle: CoreBluetooth `identifier.UUIDString` / Android MAC. */
  deviceId: string;
  /** Advertised name, when the peripheral advertises one. */
  name: string | null;
  /** Signal strength in dBm, when the platform reports one. */
  rssi: number | null;
};

/** Bluetooth permission state, normalised across iOS and Android. */
export type BlePermissionState = "granted" | "denied" | "prompt" | "unsupported";

/** What the radio is doing right now (also the `connectionStateChange` payload). */
export type BleConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected";

export type BleStatus = {
  state: BleConnectionState;
  deviceId: string | null;
  deviceName: string | null;
};

/** Result of a successful `connect()`: the channel the driver will use. */
export type BleConnection = {
  deviceId: string;
  deviceName: string | null;
  serviceUuid: string;
  txCharacteristicUuid: string;
  rxCharacteristicUuid: string;
};

/**
 * Result of one command round-trip. `response` is whatever the adapter sent
 * (raw text, never reinterpreted). `complete` is true only when the ELM327
 * prompt arrived inside the timeout — a partial read is reported as partial
 * instead of being passed off as an answer.
 */
export type BleWriteResult = {
  response: string;
  complete: boolean;
};

/** Capacitor's listener handle shape. */
export type BleListenerHandle = { remove: () => Promise<void> };

/**
 * The plugin contract, mirrored 1:1 in Swift and Kotlin. Capacitor passes
 * exactly one options object per call, so every method takes one — that is a
 * Capacitor convention, not a preference.
 */
export interface IMechanicBleBridge {
  requestPermissions(): Promise<{ bluetooth: BlePermissionState }>;
  scan(options?: { timeoutMs?: number }): Promise<{ devices: BleDevice[] }>;
  connect(options: {
    deviceId: string;
    serviceUuid?: string;
    txCharacteristicUuid?: string;
    rxCharacteristicUuid?: string;
    timeoutMs?: number;
  }): Promise<BleConnection>;
  /** Send one AT/OBD command and resolve with the adapter's reply. */
  write(options: {
    command: string;
    timeoutMs?: number;
  }): Promise<BleWriteResult>;
  disconnect(): Promise<void>;
  getStatus(): Promise<BleStatus>;
  addListener(
    eventName: "connectionStateChange",
    listener: (status: BleStatus) => void,
  ): BleListenerHandle | Promise<BleListenerHandle>;
}

/** Every way the bridge can fail. Never a generic "something went wrong". */
export type BleErrorCode =
  /** Not running inside the iOS/Android shell. */
  | "NOT_NATIVE"
  /** Native, but the `iMechanicBle` plugin is not registered in the app. */
  | "PLUGIN_UNAVAILABLE"
  /** This device has no usable Bluetooth LE radio, or it is switched off. */
  | "NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  /**
   * Raised by the JS layer, not the native bridge: iOS reports "prompt" while
   * its permission dialog is still on screen, and we refuse to treat that as
   * consent. The user has not answered yet — say so, don't blame the radio.
   */
  | "PERMISSION_PENDING"
  | "NO_DEVICE"
  | "CONNECT_FAILED"
  /** Nothing connected — write() before connect(). */
  | "NOT_CONNECTED"
  /** The adapter did not answer inside the timeout. */
  | "TIMEOUT"
  /** The link dropped mid-session (adapter unplugged, out of range). */
  | "DISCONNECTED"
  | "INVALID_ARGUMENT"
  | "UNKNOWN";

export class BleBridgeError extends Error {
  readonly code: BleErrorCode;

  constructor(code: BleErrorCode, message: string) {
    super(message);
    this.name = "BleBridgeError";
    this.code = code;
  }
}

const NATIVE_CODES: readonly BleErrorCode[] = [
  "NOT_SUPPORTED",
  "PERMISSION_DENIED",
  "NO_DEVICE",
  "CONNECT_FAILED",
  "NOT_CONNECTED",
  "TIMEOUT",
  "DISCONNECTED",
  "INVALID_ARGUMENT",
];

/**
 * Normalise anything the bridge throws into a `BleBridgeError`. Capacitor
 * rejects with an Error carrying our native `code`; a missing plugin rejects
 * with a "not implemented" message instead of a code.
 */
export function toBleError(err: unknown): BleBridgeError {
  if (err instanceof BleBridgeError) return err;
  const raw = err as { code?: unknown; message?: unknown } | null;
  const code =
    typeof raw?.code === "string" &&
    (NATIVE_CODES as readonly string[]).includes(raw.code)
      ? (raw.code as BleErrorCode)
      : null;
  const message =
    typeof raw?.message === "string" && raw.message.trim().length > 0
      ? raw.message
      : "The Bluetooth bridge failed.";
  if (code) return new BleBridgeError(code, message);
  if (/not implemented/i.test(message)) {
    return new BleBridgeError(
      "PLUGIN_UNAVAILABLE",
      "The iMechanic Bluetooth bridge is not registered in this build.",
    );
  }
  return new BleBridgeError("UNKNOWN", message);
}

/**
 * The bridge, or a clear error. Lazy-imports `@capacitor/core` so the browser
 * bundle never carries Capacitor unless the app is actually running natively.
 */
export async function loadBleBridge(): Promise<IMechanicBleBridge> {
  if (!isNativeRuntime()) {
    throw new BleBridgeError(
      "NOT_NATIVE",
      `The native Bluetooth bridge is not available in this runtime (platform: ${nativePlatform()}).`,
    );
  }
  if (!isBlePluginAvailable()) {
    throw new BleBridgeError(
      "PLUGIN_UNAVAILABLE",
      "The iMechanic Bluetooth bridge is not registered in this build.",
    );
  }
  let registerPlugin: typeof import("@capacitor/core")["registerPlugin"];
  try {
    ({ registerPlugin } = await import("@capacitor/core"));
  } catch {
    throw new BleBridgeError(
      "PLUGIN_UNAVAILABLE",
      "The iMechanic Bluetooth bridge could not be loaded in this build.",
    );
  }
  return registerPlugin<IMechanicBleBridge>("iMechanicBle");
}

/**
 * Adapter-name hints. Cheap ELM327 clones advertise one of these; a shell
 * that scanned the whole neighbourhood should not pick the neighbour's
 * headphones when an adapter is in range.
 */
const ADAPTER_NAME_HINTS =
  /ELM\s?327|OBD\s?-?\s?II|OBD2|V-?LINK|Vgate|KONNWEI|iCar|Viecar|Vscan|ANCEL|Autel|Foseal|BAFX|VEEPEAK|Mini-?VCI|Car Scanner|Cheap/i;

/**
 * Choose the adapter to connect to from a scan result. Pure and ordered:
 *   1. the device the caller asked for by id, when it is in the list;
 *   2. a device whose advertised name looks like an OBD2 adapter, strongest
 *      signal first;
 *   3. an unknown-but-named device, strongest signal first;
 *   4. an unnamed device — last resort, and never when a named one exists.
 * A device with no reported signal sorts below one that has a signal.
 */
export function pickAdapterDevice(
  devices: readonly BleDevice[],
  preferredDeviceId?: string | null,
): BleDevice | null {
  if (devices.length === 0) return null;
  if (preferredDeviceId) {
    const preferred = devices.find((d) => d.deviceId === preferredDeviceId);
    if (preferred) return preferred;
  }
  const rank = (device: BleDevice): number => {
    if (device.name && ADAPTER_NAME_HINTS.test(device.name)) return 0;
    if (device.name) return 1;
    return 2;
  };
  const signal = (device: BleDevice): number =>
    typeof device.rssi === "number" ? device.rssi : -127;
  return [...devices].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return signal(b) - signal(a);
  })[0]!;
}

/** Honest, short label for the current radio state. */
export function describeBleState(status: BleStatus): string {
  switch (status.state) {
    case "connected":
      return status.deviceName
        ? `Connected to ${status.deviceName}`
        : "Adapter connected";
    case "connecting":
      return "Connecting…";
    case "scanning":
      return "Looking for adapters…";
    case "disconnected":
      return "Not connected";
  }
}
