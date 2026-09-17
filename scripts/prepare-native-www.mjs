#!/usr/bin/env node
/**
 * Prepare the Capacitor webDir (`native/www`) — slice S7.
 *
 * The web app is server-rendered, so the native shells load the deployed
 * origin (`server.url` in capacitor.config.ts). `webDir` still has to hold a
 * real, complete web asset bundle for `cap copy`/`cap sync`, and it holds the
 * honest offline page Capacitor shows when the origin is unreachable.
 *
 * What this does, idempotently:
 *   1. copies the built client assets (`dist/client`) into `native/www/app/`
 *   2. writes `native/www/app/index.html` — a tiny shell that hands off to the
 *      deployed app — so the copied bundle has an entry point
 *   3. leaves the committed `index.html` + `offline.html` in place
 *
 * It is a build step, never a source of truth: `native/www/app/` is gitignored
 * and re-created on every run. Running it without a build (`dist/client`
 * missing) is fine — it keeps the committed shell and says so.
 */
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "dist", "client");
const webDir = path.join(root, "native", "www");
const copied = path.join(webDir, "app");

const serverUrl =
  (process.env.CAPACITOR_SERVER_URL ?? "").trim() ||
  "https://www.imechanic.app";

const shellIndex = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>iMechanic</title>
    <script>
      // Bundled copy of the app's web assets. iMechanic is server-rendered, so
      // this entry point hands the WebView straight to the deployed app.
      location.replace(${JSON.stringify(`${serverUrl}/app`)});
    </script>
  </head>
  <body>
    <p>Opening iMechanic… <a href="${serverUrl}/app">Open iMechanic</a></p>
  </body>
</html>
`;

async function main() {
  await mkdir(webDir, { recursive: true });

  if (!existsSync(source)) {
    console.warn(
      "[native:prepare] dist/client not found — run `bun run build` first.\n" +
        "[native:prepare] keeping the committed shell in native/www (cap sync still works).",
    );
    return;
  }

  await rm(copied, { recursive: true, force: true });
  await cp(source, copied, { recursive: true });
  await writeFile(path.join(copied, "index.html"), shellIndex, "utf8");

  const entries = await readdir(copied);
  console.log(
    `[native:prepare] copied dist/client → native/www/app (${entries.length} entries)\n` +
      `[native:prepare] server origin: ${serverUrl}`,
  );
}

main().catch((err) => {
  console.error("[native:prepare] failed:", err);
  process.exitCode = 1;
});
