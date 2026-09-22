/**
 * Dev-only: render every icon in src/components/icons.tsx into a single static
 * HTML sheet (light + dark, three sizes) so geometry can be eyeballed in a
 * browser without booting the app or signing in. Not shipped, not imported.
 *
 *   bun scripts/icon-preview.mjs && open /tmp/icon-preview.html
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/components/icons.tsx", "utf8");
const re = /export function (\w+)\(props: IconProps\) \{\s*return \(\s*<svg \{\.\.\.base\(props\)\}>([\s\S]*?)<\/svg>/g;
const icons = [];
let m;
while ((m = re.exec(src))) {
  icons.push({ name: m[1], body: m[2].trim() });
}

const cell = (i, size) => `
  <figure class="cell">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${i.body}</svg>
    <figcaption>${i.name}</figcaption>
  </figure>`;

const board = (size) => `<div class="grid">${icons.map((i) => cell(i, size)).join("")}</div>`;

const NEW = ["ScanIcon", "EngineIcon", "ObdPortIcon", "AdapterIcon", "GaugeIcon", "BluetoothIcon", "BatteryIcon", "ThermoIcon", "SweepIcon"];
const bigBoard = (size) =>
  `<div class="grid">${icons.filter((i) => NEW.includes(i.name)).map((i) => cell(i, size)).join("")}</div>`;

const html = `<!doctype html><meta charset="utf-8"><title>icon preview</title>
<style>
  body { margin:0; font: 12px/1.4 system-ui, sans-serif; }
  section { padding: 20px 24px; }
  .light { background:#f8fafc; color:#0f172a; }
  .dark  { background:#0b1220; color:#e2e8f0; }
  .grid { display:flex; flex-wrap:wrap; gap:14px; }
  .big .cell { width:150px; }
  .cell { margin:0; width:104px; display:flex; flex-direction:column; align-items:center; gap:6px;
          padding:10px 4px; border:1px solid currentColor; border-radius:10px; opacity:.95; }
  figcaption { font-size:10px; opacity:.7; text-align:center; }
  .brand .cell { border:none; }
  .brand span { display:inline-flex; align-items:center; justify-content:center;
                border-radius:10px; background:#f59e0b; color:#0b1220; }
  h1 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; margin:0 0 12px; opacity:.6; }
</style>
<section class="light big"><h1>new icons — 110px</h1>${bigBoard(110)}</section>
<section class="light"><h1>light — 32px</h1>${board(32)}</section>
<section class="light"><h1>light — 20px / 16px (real tab + inline sizes)</h1>${board(20)}${board(16)}</section>
<section class="dark"><h1>dark — 32px</h1>${board(32)}</section>
<section class="dark brand"><h1>brand mark — engine on amber (32 / 28 / 20)</h1>
  <div class="grid">
    ${[40, 32, 20]
      .map((s) => {
        const e = icons.find((i) => i.name === "EngineIcon");
        return `<figure class="cell"><span style="width:${s * 1.8}px;height:${s * 1.8}px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" width="${s}" height="${s}">${e.body}</svg>
        </span><figcaption>${s}px glyph</figcaption></figure>`;
      })
      .join("")}
  </div>
</section>`;

writeFileSync("/tmp/icon-preview.html", html);
console.log(`wrote /tmp/icon-preview.html with ${icons.length} icons`);
