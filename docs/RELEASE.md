# iMechanic — Android release runbook (Google Play)

This is the exact, copy-pasteable procedure to turn the repository into a signed
Android App Bundle (`.aab`) and upload it to Google Play. It is written for the
owner to run on their own machine (or in Android Studio); it is **not** something
the team's build box can complete, because the box has no Android Studio, no
release keystore and not enough memory for the full Kotlin compile.

Everything here is already wired in the repository. There is nothing to add to
the code to make a release: `android/app/build.gradle` reads the signing
credentials (slice S10-T1), and the manifest and SDK levels are final for this
release (slice S10-T3).

---

## 0. What you need, once

| Need | Why | Status |
| --- | --- | --- |
| JDK 21 | The Android Gradle Plugin 8.10.1 and `kotlinOptions.jvmTarget = "21"` require it | usually bundled with a recent Android Studio |
| Android SDK: platform 36 + build-tools 36.0.0 | `compileSdkVersion`/`targetSdkVersion` are 36 (Android 16) | Android Studio → SDK Manager |
| Node.js + bun, then `bun install` | the web assets are built from this repo | — |
| A Google Play developer account + an app entry | to upload the bundle | ready |
| `app.imechanic` confirmed as the permanent application id | it cannot be changed after the first release | **confirm before the first upload** |

The Gradle wrapper (`android/gradlew`, Gradle 8.11.1) is committed, so no
separate Gradle install is needed.

---

## 1. Create the upload keystore (once, ever)

Run this **outside the repository** (e.g. in your home directory), so the key can
never be committed by accident:

```bash
keytool -genkeypair -v -keystore ~/imechanic-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

It prompts once for a store password, then for your name/organisation details,
then for a key password (press Enter to reuse the store password).

Two rules about this file:

- **Back it up somewhere else.** If it is lost, you can no longer update this app
  listing on Play — Google requires every later upload to be signed with the same
  key. There is no recovery.
- **Never commit it, and never put its passwords in `capacitor.config.ts`, the
  web app or any file inside git.** `*.jks`, `*.keystore` and
  `keystore.properties` are already git-ignored in both `android/.gitignore` and
  the repository root `.gitignore`.

---

## 2. Point the build at the keystore

Create `android/keystore.properties` (git-ignored) with exactly these four keys —
these names are what `android/app/build.gradle` reads:

```properties
storeFile=imechanic-upload.jks
storePassword=THE_STORE_PASSWORD
keyAlias=upload
keyPassword=THE_KEY_PASSWORD
```

- `storeFile` may be an absolute path (`/home/you/imechanic-upload.jks`) or a
  path relative to `android/`. The example above means the file sits at
  `android/imechanic-upload.jks`.
- A value in this file **wins over** the matching environment variable.

Alternative for CI, or a machine with no properties file — export all four:

```bash
export IMECHANIC_UPLOAD_STORE_FILE=/abs/path/imechanic-upload.jks
export IMECHANIC_UPLOAD_STORE_PASSWORD=…
export IMECHANIC_UPLOAD_KEY_ALIAS=upload
export IMECHANIC_UPLOAD_KEY_PASSWORD=…
```

You do not have to configure anything else. At the start of every Gradle run the
build prints which source it used:

- `iMechanic release signing: using credentials from android/keystore.properties.`
- `… using credentials from the IMECHANIC_UPLOAD_* environment variables.`
- a **warning** naming the missing key(s) if the set is incomplete; the build
  still runs but produces an **unsigned** bundle, which Play will refuse.

If you prefer a GUI, Android Studio's *Build → Generate Signed App Bundle* wizard
does the same thing; just make sure it writes the same `app.imechanic`
application id and a *release* build type.

---

## 3. Bump the version — every single upload

`android/app/build.gradle`, in `defaultConfig`:

```groovy
versionCode 1        // integer. +1 on EVERY upload, never reused, never decreased.
versionName "1.0"    // human-facing string, semver (1.0 → 1.0.1 → 1.1 → 2.0)
```

Google Play rejects an upload whose `versionCode` is not higher than the last one
it accepted, and a number used once is burned forever. Bump **both** values in the
same pull request that creates the release, so the tag, the bundle and the store
listing cannot disagree.

---

## 4. Build the web assets and sync them into the native project

From the repository root:

```bash
bun install                # only if node_modules is missing/out of date
bun run build              # writes dist/client — the web app in the shell
bun run native:prepare     # copies dist/client → native/www (Capacitor's webDir)
npx cap sync android       # copies the web assets + plugins into android/
```

Notes:

- `bun run native:prepare` on its own is enough if you do not want to rebuild the
  web app — it says so in its output and keeps the committed offline shell when
  `dist/client` is absent. Running `bun run build` first is what makes a release
  bundle contain the current web assets, so do it for anything you intend to
  upload.
- `bun run native:sync` is the one-shot version of the last three commands.
- The shell loads the **deployed** web origin (`server.url` in
  `capacitor.config.ts`, currently `https://www.imechanic.app`), so the web side
  should already be published before you upload the bundle.

---

## 5. Build the signed bundle

```bash
cd android
./gradlew bundleRelease
```

The first run downloads Gradle 8.11.1, AGP 8.10.1 and the AndroidX artifacts, so
give it time and a network connection.

On a machine with little RAM, add the memory flags (this is how the team's box
gets through the configuration phase):

```bash
./gradlew bundleRelease --no-daemon --max-workers=1 -Dorg.gradle.jvmargs=-Xmx1400m
```

Android Studio: *Build → Build Bundle(s) / APK(s) → Build Bundle(s)*, with the
**release** variant selected.

---

## 6. Find and check the artifact

```bash
ls -la android/app/build/outputs/bundle/release/
```

A correctly signed release build writes:

```
android/app/build/outputs/bundle/release/app-release.aab
```

This is the file you upload. Two things to check before you do:

1. **It is not named `…-unsigned…`.** An unsigned artifact (produced when the four
   credentials are missing — see the warning in step 2) is refused by Play.
2. **It really is signed**, and by the key you think:

   ```bash
   jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab | head
   ```

   Android Studio's *Build → Analyze APK/Bundle* shows the same signing
   information in the GUI.

Optional, if `bundletool` is installed — confirms the persisted `minSdk` inside
the bundle, which for this release must be **31 (Android 12)**:

```bash
bundletool dump manifest --bundle=android/app/build/outputs/bundle/release/app-release.aab | grep -i sdkversion
```

---

## 7. Upload to Play Console

1. **Play Console → your app → Testing → Internal testing → Create new release.**
   Upload the `.aab`. Always go through internal testing first, on the same
   `versionCode` track, before promoting to production.
2. **App content → Data safety.** Declare: no location data collected or shared.
   The Android build declares **zero location permissions** — the manifest keeps
   only `BLUETOOTH_SCAN` (with `neverForLocation`) and `BLUETOOTH_CONNECT` — so
   the location section is a blanket "no".
3. **App content → Ads:** no ads. **Analytics:** none shipped.
4. **App content → Account deletion:** the app deletes the account in-app
   (`/app/account` → Danger zone), and the public page `/delete-account`
   describes it. Paste the public URL when Play asks for one.
5. **App content → App access:** the reviewer sign-in address plus the access code
   (`playreview@imechanic.app`) and the exact steps to reach a scan. The code
   lives in Settings → Secrets as `REVIEW_ACCESS_CODE` — put the same code in the
   Play instructions and **delete the secret once the review window closes**.
6. **Store listing → graphics:** the prepared assets are in `design/store/`
   (`01-today.png`, `02-connect-adapter.png`, `03-scan-result-verdict.png`,
   `04-cost-decision.png`, `05-guided-repair.png`, `06-pro-bands.png`,
   `07-codes-read-demo-labelled.png`) plus
   `design/feature-graphic-1024x500.png`. Descriptive text must match the app as
   it actually behaves: free tier is code reading, clearing, plain-English
   meaning and the severity verdict; Pro (AI root cause, cost decision, guided
   repair) is a paid tier that is **not** purchasable inside the Android app —
   there is no purchase entry point in the shell, by policy (slice S9a).
7. **Release notes / countries:** the launch markets are Germany, the UK and
   Albania (see `src/lib/market.ts`).

Keep the internal-testing track the only one that carries a build until the
smoke test below has passed on a real device.

---

## 8. Smoke test, on a device, with the release build installed

Install the internal-testing build from the Play link (not a debug build), then
walk this list once and write down the result of each line:

1. **Sign in** — magic-link sign-in reaches `/app` and the session survives a
   full app close and reopen.
2. **Demo scan** — start the demo scan from Connect; it completes and the result
   is labelled **demo** everywhere it appears.
3. **BLE scan** — with a real OBD2 adapter plugged into the car and the ignition
   on: scan finds the adapter, connects, and reads codes. (This is the one path
   that can only be proven on hardware: the permission prompts are
   `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` only — if Android asks for location, the
   wrong bundle was uploaded.)
4. **Clear codes** — clear the codes, confirm the app's warning is shown, and
   confirm the car's check-engine light goes out.

If any line fails, fix and re-upload with `versionCode + 1` — never reuse the
number.

---

## 9. Things that must not be "fixed"

- **Do not lower `minSdkVersion` back down** (`android/variables.gradle`, S10-T3).
  It is 31 (Android 12) on purpose: Android 12 is the first release with
  Bluetooth-only scan permissions. Below it, Android makes a BLE scan require the
  **location** permission, and iMechanic must never request location — that is
  both a product promise and a Play data-safety declaration. Lowering minSdk
  means re-adding `ACCESS_FINE_LOCATION` to the manifest and losing the "zero
  location permissions" story.
- **Do not add a purchase button or a price to the Android shell.** Play requires
  digital subscriptions to be sold through Play Billing; we ship none, so the
  Android build must not sell or steer to buying (slice S9a — enforced in the UI
  and again server-side).
- **Do not commit the keystore or its passwords.**

---

## 10. iOS (separate, still owner-gated)

The iOS shell (`ios/`) is a build artifact, not a shipped app. Shipping it needs
an **Apple Developer account** and a **Mac with Xcode**; then
`bun run build && bun run native:prepare && npx cap sync ios`, open
`ios/App/App.xcworkspace`, set the signing team, archive and upload to App Store
Connect. The iOS shell is the only way an iPhone can talk to a real OBD2 adapter
(iOS Safari has no Web Bluetooth), which is why it exists at all.
