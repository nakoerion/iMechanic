# The iMechanic native layer (S7)

These are the **native wrappers** around the iMechanic web app — the third
product surface alongside the marketing site and the installable PWA. They
exist for one concrete reason: **iOS Safari has no Web Bluetooth**, so on an
iPhone a real OBD2 adapter can only be reached through the app's own native
Bluetooth bridge. Android Chrome *can* use Web Bluetooth, but the wrapper is
still what ships to the Play Store.

## What is here

| Path | What it is |
| --- | --- |
| `../capacitor.config.ts` | Capacitor config: appId **placeholder**, app name, `webDir`, and the deployed origin the shell loads. |
| `www/` | The `webDir`: a committed honest offline page (`offline.html`, used as `server.errorPath`), plus `app/` — the built web assets, produced by `bun run native:prepare` (gitignored). |
| `../ios/` | Capacitor iOS project (`App.xcodeproj`) + the Swift BLE plugin + the bridge controller that registers it. |
| `../android/` | Capacitor Android project (Gradle) + the Kotlin BLE plugin + the activity that registers it. |
| `../src/native/ble-bridge.ts` | The JS contract all three sides implement. |

## The BLE bridge (`iMechanicBle`)

One plugin, three implementations that must stay in lockstep — same method
names, same payload keys:

- JS surface: `src/native/ble-bridge.ts` (`registerPlugin("iMechanicBle")`)
- iOS: `ios/App/App/Plugins/IMechanicBlePlugin.swift` (CoreBluetooth)
- Android: `android/app/src/main/java/app/imechanic/ble/IMechanicBlePlugin.kt` (`android.bluetooth.le`)

| Method | Payload in | Payload out |
| --- | --- | --- |
| `requestPermissions()` | – | `{ bluetooth: "granted" \| "denied" \| "prompt" \| "unsupported" }` |
| `scan({ timeoutMs? })` | – | `{ devices: [{ deviceId, name, rssi }] }` |
| `connect({ deviceId, serviceUuid?, txCharacteristicUuid?, rxCharacteristicUuid?, timeoutMs? })` | device id from `scan` | `{ deviceId, deviceName, serviceUuid, txCharacteristicUuid, rxCharacteristicUuid }` |
| `write({ command, timeoutMs? })` | bare AT/OBD command (`ATZ`, `03`, `0902`, `04`); the bridge appends the CR | `{ response, complete }` — raw reply text, `complete: true` only when the ELM327 prompt arrived |
| `disconnect()` | – | – |
| `getStatus()` | – | `{ state, deviceId, deviceName }` |
| event `connectionStateChange` | – | the same status payload |

### How it maps to an ELM327 adapter

Cheap ELM327 BLE clones expose a UART-style pair of characteristics. The
bridge:

1. scans without a service filter — many clones advertise no service UUID, so
   the adapter is chosen in JS (`pickAdapterDevice`, which prefers names like
   `ELM327`/`OBDII`/`Vgate` and then signal strength);
2. connects, discovers services, and prefers the clone service UUIDs
   `FFE0`, `FFF0`, `FF00`, `FFE5` (the web driver probes `FFE1`/`FFF1`
   instead — same intent);
3. picks the **write** characteristic (TX) and the **notify** characteristic
   (RX) by their properties, so one UUID pair is not hardcoded; on Android it
   also writes the CCCD descriptor (`2902`), which `setCharacteristicNotification`
   alone does not do;
4. on `write`, sends `command + CR` and resolves only when the ELM327 prompt
   `>` has been seen — otherwise it returns `complete: false`, or the platform
   timeout rejects with `TIMEOUT`. **A partial reply is never presented as a
   valid scan.**

Failure codes, identical on all three sides: `NOT_NATIVE`,
`PLUGIN_UNAVAILABLE`, `NOT_SUPPORTED`, `PERMISSION_DENIED`, `NO_DEVICE`,
`NOT_CONNECTED`, `CONNECT_FAILED`, `TIMEOUT`, `DISCONNECTED`,
`INVALID_ARGUMENT`, `UNKNOWN`. The driver maps them onto plain-language
message + hint pairs (`src/obd/elm327-live.ts`), and the app falls back to the
free demo mode rather than inventing a diagnosis.

One code is **JS-layer only**, not a native one: `PERMISSION_PENDING`. iOS
answers `requestPermissions` with `"prompt"` while the system dialog is still
on screen, and the web layer must not read that as consent — so
`connectNativeBle()` re-asks (bounded, 3 attempts) and, if the user still has
not answered, reports `PERMISSION_PENDING` instead of running `scan()` and
blaming the radio. No native plugin ever rejects with it.

## Building the wrappers

Prerequisites (not installable on the build machine this repo was authored on):

- **iOS**: macOS with Xcode 16+, CocoaPods (`cap sync ios` runs `pod install`).
  Deployment target 14.0.
- **Android**: JDK 21 + Android SDK (compileSdk 35). The Kotlin Gradle plugin
  (`2.0.21`, see `android/variables.gradle`) was added because the app's own
  plugin is Kotlin.

```bash
bun install                     # Capacitor CLI + platforms live in devDependencies
bun run build                   # build the web app (unchanged by S7)
bun run native:prepare          # copy the built assets into native/www/app
bun run native:copy             # == cap copy — assets + config only, no toolchain
npx cap sync                    # assets + native deps (needs CocoaPods on macOS)
npx cap open ios                # Xcode
npx cap open android            # Android Studio
```

`bun run native:sync` runs build + prepare + `cap sync` in one step.

Point a shell at the working site instead of production with
`CAPACITOR_SERVER_URL=https://<working-host> bun run native:sync`.

## `server.url` — why the shell loads the deployed app

The web app is server-rendered: sessions, magic-link auth, scans, diagnoses
and Stripe all live behind TanStack Start server functions. A static copy of
`dist/client` cannot serve those, so `capacitor.config.ts` sets `server.url` to
the deployed origin (`https://www.imechanic.app`) and `webDir` stays as the
bundle/offline fallback. `server.errorPath` points at `www/offline.html`, so a
lost connection shows an honest page instead of a blank WebView.

If the app ever gets a fully static/offline mode, drop `server.url` and the
shell will load `webDir` directly.

## Status of this slice (build artifacts only)

- ✅ Capacitor 7 wiring, `capacitor.config.ts`, `ios/` and `android/` scaffolds.
- ✅ The JS contract, plus the Swift and Kotlin implementations and their
  registration in both projects (`IMechanicBridgeViewController.capacitorDidLoad()`,
  `MainActivity.registerPlugin(...)`).
- ✅ Driver integration: inside the shell `browserCapabilities().native` is
  `true` and the scan screen offers a third transport next to Web Bluetooth and
  Web Serial. In a plain browser nothing changes.
- ⚠️ **Not compiled here.** This repository was built on Linux: no Xcode, no
  Android SDK, no device. The native sources are complete and internally
  consistent with Capacitor 7's APIs, but the first real compile has to happen
  on a machine with the toolchains. Expect small adjustments there.
- ⚠️ **`appId` is a placeholder** (`app.imechanic`). The owner must confirm it
  before store submission: it is the permanent bundle identifier.
- ⛔ **Store submission is out of scope.** It needs the owner's Apple Developer
  and Google Play accounts, signing identities, screenshots and privacy
  declarations (Bluetooth usage is described in `ios/App/App/Info.plist` and
  `android/app/src/main/AndroidManifest.xml`).
