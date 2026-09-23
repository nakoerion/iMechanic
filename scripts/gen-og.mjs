/**
 * iMechanic social-share image (M1) — deterministic vector → PNG generator.
 *
 *   bun scripts/gen-og.mjs        (also runs under plain `node`)
 *
 * Outputs
 *   design/og.svg    vector master, 1200x630, readable source (fonts by
 *                    relative url() into ../public/fonts)
 *   public/og.png    the shipped raster referenced by og:image / twitter:image
 *
 * Why it is drawn and not photographed: the share card is the first thing
 * anyone sees of the product, so it has to look like iMechanic — the night
 * instrument ground, the technical grid, the horizon glow and the telltale
 * verdict lamps — not like stock automotive photography. Every colour below is
 * a design token from src/styles/app.css and every glyph is parsed out of
 * src/components/icons.tsx, so the card cannot drift away from the app the way
 * a hand-made bitmap would. Same inputs → same PNG.
 *
 * Rasteriser: headless Chromium (the only renderer on this machine, and the
 * one with real woff2 + SVG mask support). `design/og.svg` keeps *relative*
 * font URLs so it stays legible as source; for the render step the fonts are
 * inlined as base64 into a throwaway copy under the OS temp dir, because a
 * file:// document may not fetch sibling files. Nothing in `public/` is read
 * at runtime by this script other than the font binaries.
 *
 * Copy rule (AGENTS.md): every word on the card already exists on the landing
 * page or in the route head. No new claim, no price, no urgency.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Tokens (src/styles/app.css). Dark-theme values: the card is painted */
/* on the fixed navy marketing ground, which never flips.              */
/* ------------------------------------------------------------------ */
const NAVY_950 = "#0b1220"; // --color-navy-950, the ground
const NAVY_900 = "#101a2e"; // --color-navy-900, the plate ground
const BRAND = "#fbbf24"; // --ui-brand
const ON_BRAND = "#0b1220"; // --ui-on-brand
const AMBER_300 = "#fcd34d"; // dark --ui-brand-fg, the legend colour on navy
const SLATE_200 = "#e2e8f0";
const SLATE_300 = "#cbd5e1";
const SLATE_400 = "#94a3b8";
const WHITE = "#ffffff";
/* Severity — dark theme. solid = the lamp, on* = its rim and glyph,
   fg = the word. Untouched hexes; the triad is the product's identity. */
const SEVERITY = [
  { icon: "DriveOnIcon", label: "Drive on", solid: "#34d399", on: "#04231a", fg: "#6ee7b7" },
  { icon: "RepairSoonIcon", label: "Repair soon", solid: "#fb923c", on: "#2e1607", fg: "#fdba74" },
  { icon: "StopDrivingIcon", label: "Stop driving", solid: "#f87171", on: "#350f10", fg: "#fca5a5" },
];

const W = 1200;
const H = 630;
const STROKE = 2; // icons.tsx `base()`
const VIEWBOX = 24;

/* ------------------------------------------------------------------ */
/* Glyph source: src/components/icons.tsx — one source of truth        */
/* ------------------------------------------------------------------ */
function readGlyph(name) {
  const src = readFileSync("src/components/icons.tsx", "utf8");
  const re = new RegExp(`export function ${name}\\(props: IconProps\\)[\\s\\S]*?</svg>`);
  const fn = re.exec(src);
  if (!fn) throw new Error(`${name} not found in src/components/icons.tsx — did it move?`);
  const shapes = [...fn[0].matchAll(/<(path|circle|rect)\s([^>]+?)\s*\/>/g)].map((m) => ({
    tag: m[1],
    attrs: m[2],
  }));
  if (shapes.length === 0) throw new Error(`${name} has no drawable shapes`);
  return shapes
    .map((s) => `<${s.tag} ${s.attrs} />`)
    .join("\n        ");
}

/** A 24-unit glyph, scaled and centred on (cx, cy) at `size` px. */
function glyph(name, cx, cy, size, colour) {
  const scale = size / VIEWBOX;
  const x = cx - size / 2;
  const y = cy - size / 2;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(scale, 5)})"
        fill="none" stroke="${colour}" stroke-width="${STROKE}"
        stroke-linecap="round" stroke-linejoin="round">
        ${readGlyph(name)}
      </g>`;
}

const r = (n, digits = 3) => Number(n.toFixed(digits));

/* ------------------------------------------------------------------ */
/* Fonts                                                              */
/* ------------------------------------------------------------------ */
const FONTS = [
  { family: "Inter", weight: "400 800", file: "inter-latin.woff2" },
  { family: "IBM Plex Mono", weight: "400", file: "ibm-plex-mono-latin-400.woff2" },
  { family: "IBM Plex Mono", weight: "600", file: "ibm-plex-mono-latin-600.woff2" },
];

function fontCss(embed) {
  /* The rules MUST sit inside a real <style> element: @font-face text dropped
     straight into <defs> is ignored, and every label silently falls back to
     the renderer's default serif. */
  const faces = FONTS.map((f) => {
    const src = embed
      ? `url("data:font/woff2;base64,${readFileSync(`public/fonts/${f.file}`).toString("base64")}") format("woff2")`
      : `url("../public/fonts/${f.file}") format("woff2")`;
    return `    @font-face {
      font-family: "${f.family}";
      font-style: normal;
      font-weight: ${f.weight};
      src: ${src};
    }`;
  }).join("\n");
  return `    <style type="text/css">
${faces}
    </style>`;
}

/* ------------------------------------------------------------------ */
/* The card                                                           */
/* ------------------------------------------------------------------ */
const PAD = 76;
/* Verdict plate, right-hand column. --radius-plate = 0.5rem = 8px. */
const PLATE = { x: 726, y: 132, w: 398, h: 366, r: 8, head: 66, row: 100 };

function card(embed) {
  const rows = SEVERITY.map((s, i) => {
    const top = PLATE.y + PLATE.head + i * PLATE.row;
    const cy = top + PLATE.row / 2;
    const divider =
      i === 0
        ? ""
        : `<line x1="${PLATE.x}" y1="${top}" x2="${PLATE.x + PLATE.w}" y2="${top}"
        stroke="${WHITE}" stroke-opacity="0.08" stroke-width="1" />`;
    return `${divider}
      <!-- Motif 1, the telltale lamp: round, solid severity fill, 2px inset
           rim in the on-* role, silhouette in the same role. -->
      <circle cx="${PLATE.x + 62}" cy="${r(cy)}" r="30" fill="${s.solid}" />
      <circle cx="${PLATE.x + 62}" cy="${r(cy)}" r="29" fill="none"
        stroke="${s.on}" stroke-width="2" />
      ${glyph(s.icon, PLATE.x + 62, cy, 34, s.on)}
      <text x="${PLATE.x + 110}" y="${r(cy + 8)}" fill="${s.fg}"
        font-family="IBM Plex Mono" font-size="23" font-weight="600"
        letter-spacing="1.4">${s.label.toUpperCase()}</text>`;
  }).join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
  viewBox="0 0 ${W} ${H}" role="img"
  aria-label="iMechanic — from fault code to completed repair">
  <title>iMechanic — From fault code to completed repair</title>
  <!-- Generated by scripts/gen-og.mjs. Do not hand-edit: re-run the script. -->
  <defs>
${fontCss(embed)}
    <!-- Motif 8, the technical grid: 3.5% hairlines on a 56px cell, faded
         out before the edges exactly as .im-techgrid does on the site. -->
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M56 0V56M0 56H56" stroke="${WHITE}" stroke-opacity="0.035"
        stroke-width="1" fill="none" />
    </pattern>
    <radialGradient id="gridFade" cx="0.5" cy="0.15" r="0.9">
      <stop offset="0" stop-color="${WHITE}" />
      <stop offset="0.45" stop-color="${WHITE}" />
      <stop offset="0.85" stop-color="#000000" />
    </radialGradient>
    <mask id="gridMask">
      <rect width="${W}" height="${H}" fill="url(#gridFade)" />
    </mask>
    <!-- The horizon glow: the light the instrument is lit by. Same geometry
         and the same three stops as .im-horizon. -->
    <radialGradient id="horizon" gradientUnits="userSpaceOnUse"
      cx="600" cy="668" r="960"
      gradientTransform="translate(600 668) scale(1 0.40625) translate(-600 -668)">
      <stop offset="0" stop-color="${BRAND}" stop-opacity="0.18" />
      <stop offset="0.4" stop-color="${BRAND}" stop-opacity="0.06" />
      <stop offset="0.74" stop-color="${BRAND}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${NAVY_950}" />
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)" />
  <rect width="${W}" height="${H}" fill="url(#horizon)" />
  <!-- Motif 2, the backlit bezel: one lit hairline along the top edge. -->
  <line x1="0" y1="0.5" x2="${W}" y2="0.5" stroke="${WHITE}"
    stroke-opacity="0.12" stroke-width="1" />

  <!-- Brand row: the amber tile + engine mark the app header and the
       installed icon use, so a share card is recognisably the same product. -->
  <g>
    <rect x="${PAD}" y="64" width="52" height="52" rx="12" fill="${BRAND}" />
    ${glyph("EngineIcon", PAD + 26, 90, 30, ON_BRAND)}
    <text x="${PAD + 68}" y="100" fill="${WHITE}" font-family="Inter"
      font-size="32" font-weight="700" letter-spacing="-0.4">iMechanic</text>
  </g>

  <!-- Eyebrow, headline and subline: the landing page's own words. -->
  <text x="${PAD}" y="198" fill="${AMBER_300}" font-family="Inter"
    font-size="17" font-weight="600" letter-spacing="1.6">FOR OUT-OF-WARRANTY CAR OWNERS</text>
  <text x="${PAD}" y="278" fill="${WHITE}" font-family="Inter"
    font-size="63" font-weight="800" letter-spacing="-1.6">From fault code to</text>
  <text x="${PAD}" y="350" fill="${BRAND}" font-family="Inter"
    font-size="63" font-weight="800" letter-spacing="-1.6">completed repair.</text>
  <line x1="${PAD}" y1="394" x2="${PAD + 520}" y2="394" stroke="${WHITE}"
    stroke-opacity="0.12" stroke-width="1" />
  <text x="${PAD}" y="436" fill="${SLATE_300}" font-family="Inter"
    font-size="25" font-weight="500">Reading codes and clearing them is</text>
  <text x="${PAD}" y="472" fill="${SLATE_200}" font-family="Inter"
    font-size="25" font-weight="700">free, always.</text>

  <text x="${PAD}" y="556" fill="${SLATE_400}" font-family="IBM Plex Mono"
    font-size="21" font-weight="400" letter-spacing="0.6">imechanic.app</text>

  <!-- Motif 6, the data plate: the three verdicts the rules engine returns. -->
  <g>
    <rect x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.w}" height="${PLATE.h}"
      rx="${PLATE.r}" fill="${NAVY_900}" stroke="${WHITE}" stroke-opacity="0.1"
      stroke-width="1" />
    <path d="M${PLATE.x + PLATE.r} ${PLATE.y + 1}h${PLATE.w - PLATE.r * 2}"
      stroke="${WHITE}" stroke-opacity="0.12" stroke-width="1" fill="none" />
    <text x="${PLATE.x + 28}" y="${PLATE.y + 40}" fill="${AMBER_300}"
      font-family="Inter" font-size="15" font-weight="600"
      letter-spacing="1.4">SEVERITY VERDICT</text>
    <line x1="${PLATE.x}" y1="${PLATE.y + PLATE.head}" x2="${PLATE.x + PLATE.w}"
      y2="${PLATE.y + PLATE.head}" stroke="${WHITE}" stroke-opacity="0.08"
      stroke-width="1" />
    ${rows}
  </g>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Raster                                                             */
/* ------------------------------------------------------------------ */
function chromiumBinary() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    "/usr/local/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "No Chromium found. Set CHROMIUM_BIN to a Chrome/Chromium binary; " +
        "design/og.svg is still written and can be rasterised anywhere.",
    );
  }
  return found;
}

/** Reads width/height straight out of the PNG IHDR — proof, not assumption. */
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function rasterise(svg) {
  const dir = tmpdir();
  const html = join(dir, "imechanic-og.html");
  const out = join(dir, "imechanic-og.png");
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:${NAVY_950};width:${W}px;height:${H}px;overflow:hidden}</style>
</head><body>${svg}</body></html>`,
  );
  execFileSync(
    chromiumBinary(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${W},${H}`,
      `--screenshot=${out}`,
      `file://${html}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const png = readFileSync(out);
  const size = pngSize(png);
  if (size.width !== W || size.height !== H) {
    throw new Error(`Rasterised at ${size.width}x${size.height}, expected ${W}x${H}`);
  }
  return png;
}

function main() {
  mkdirSync("design", { recursive: true });
  writeFileSync("design/og.svg", card(false));
  console.log("wrote design/og.svg (vector master)");

  const png = rasterise(card(true));
  writeFileSync("public/og.png", png);
  console.log(`wrote public/og.png (${W}x${H}, ${(png.length / 1024).toFixed(1)} KB)`);
}
main();
