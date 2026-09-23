/**
 * iMechanic — Google Play feature graphic (1024x500) — deterministic generator.
 *
 *   bun scripts/gen-feature-graphic.mjs      (also runs under plain `node`)
 *
 * Mirrors `scripts/gen-og.mjs`: the same tokens, the same motifs, the same
 * rasteriser (headless Chromium, device scale 1, so the PNG is exactly
 * 1024x500 byte-for-byte reproducible from this source).
 *
 * Art direction (see design/og.svg, the M1/M2 share card):
 *   - navy-950 #0b1220 ground
 *   - motif 8: the 3.5% hairline technical grid, faded before the edges
 *   - the horizon glow the instrument is lit by
 *   - motif 2: one lit hairline along the top edge (the backlit bezel)
 *   - the brand row: amber tile + engine mark, as in the app header and the
 *     installed icon
 *   - the landing page's own headline, unchanged: "From fault code to
 *     completed repair."
 *   - a phone frame holding the real verdict words and one real sample code
 *     from the app's marketing samples (SAMPLE_SCAN in src/lib/sample.ts).
 *
 * No new copy, prices or claims: every string here already exists on the
 * landing page or in the app.
 *
 * Outputs (both in design/, which is never served to visitors):
 *   design/feature-graphic.svg              vector master
 *   design/feature-graphic-1024x500.png     the Play upload
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Tokens (src/styles/app.css). Dark values: the graphic is painted on */
/* the fixed navy marketing ground, which never flips.                 */
/* ------------------------------------------------------------------ */
const NAVY_950 = "#0b1220"; // --color-navy-950, the ground
const NAVY_900 = "#101a2e"; // --color-navy-900, the plate ground
const BRAND = "#fbbf24"; // --ui-brand
const ON_BRAND = "#0b1220"; // --ui-on-brand
const AMBER_300 = "#fcd34d"; // dark --ui-brand-fg
const SLATE_200 = "#e2e8f0";
const SLATE_300 = "#cbd5e1";
const SLATE_400 = "#94a3b8";
const WHITE = "#ffffff";
/* Severity — dark theme: solid = the lamp, on = its rim and glyph,
   fg = the word. The product's identity; untouched hexes. */
const SEV = {
  driveOn: { solid: "#34d399", on: "#04231a", fg: "#6ee7b7", label: "DRIVE ON" },
  repairSoon: { solid: "#fb923c", on: "#2e1607", fg: "#fdba74", label: "REPAIR SOON" },
};
/* The engine / MIL pictogram — the mark in design/engine-mark.svg, which
   scripts/gen-icons.mjs generates from EngineIcon in src/components/icons.tsx. */
const ENGINE_MARK = `
    <path d="M2.7 12.3h1.8v-2.2h3.7V6.7h6.5v3.4h3.7v2.2h2.9v3h-2.9v3.1H4.5v-2.6H2.7z" />
    <path d="m13 12.1-2.1 3.1h2.2l-2 2.6" />`;
/** The repair-soon telltale silhouette (RepairSoonIcon: a dial + a spanner). */
const REPAIR_SOON_GLYPH = `
        <circle cx="10" cy="14.2" r="7.3" />
        <path d="M10 10.3v4.1l2.7 1.6" />
        <path d="M22 2.6a3.4 3.4 0 0 1-4.4 4.4l-1.9 1.9-1.7-1.7 1.9-1.9A3.4 3.4 0 0 1 20.3.9l-2 2 1.7 1.7 2-2z" />`;
/** The drive-on telltale silhouette (DriveOnIcon: a dial with a tick). */
const DRIVE_ON_GLYPH = `
        <circle cx="12" cy="12" r="9" />
        <path d="m7.8 12.3 2.9 2.9 5.5-6" />`;

const W = 1024;
const H = 500;
const PAD = 56;
const STROKE = 2; // icons.tsx `base()`
const MONO = "IBM Plex Mono";
const r = (n, digits = 3) => Number(n.toFixed(digits));

/* ------------------------------------------------------------------ */
/* Fonts (self-hosted woff2, same files the site ships)                */
/* ------------------------------------------------------------------ */
const FONTS = [
  { family: "Inter", weight: "400 800", file: "inter-latin.woff2" },
  { family: MONO, weight: "400", file: "ibm-plex-mono-latin-400.woff2" },
  { family: MONO, weight: "600", file: "ibm-plex-mono-latin-600.woff2" },
];
/**
 * The SVG master links the fonts relatively (so it renders correctly inside
 * the repo); the PNG rasterisation embeds them as data URIs, because the
 * throwaway HTML file lives in the temp dir where a relative URL resolves to
 * nothing and every label would silently fall back to a default serif.
 */
function fontCss(embed) {
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
  /* The rules MUST sit inside a real <style> element: @font-face text dropped
     straight into <defs> is ignored. */
  return `    <style type="text/css">
${faces}
    </style>`;
}

/* ------------------------------------------------------------------ */
/* The phone frame (right-hand column)                                */
/* ------------------------------------------------------------------ */
/* Motif 6: the app's own card/plate materials, at phone scale. */
const PHONE = { x: 612, y: 44, w: 356, h: 412, r: 36, inset: 9 };
const SCREEN = {
  x: PHONE.x + PHONE.inset,
  y: PHONE.y + PHONE.inset,
  w: PHONE.w - PHONE.inset * 2,
  h: PHONE.h - PHONE.inset * 2,
  r: PHONE.r - PHONE.inset,
};
const SX = SCREEN.x + 26; // content left edge inside the screen

/** A 24-unit glyph, scaled and centred on (cx, cy) at `size` px. */
function glyph(shapes, cx, cy, size, colour) {
  const scale = size / 24;
  return `<g transform="translate(${r(cx - size / 2)} ${r(cy - size / 2)}) scale(${r(scale, 5)})"
        fill="none" stroke="${colour}" stroke-width="${STROKE}"
        stroke-linecap="round" stroke-linejoin="round">${shapes}
      </g>`;
}
/** Motif 1: the telltale lamp — round, solid severity fill, 2px inset rim. */
function lamp(sev, cx, cy, size) {
  const rad = size / 2;
  const shapes = sev.label === "DRIVE ON" ? DRIVE_ON_GLYPH : REPAIR_SOON_GLYPH;
  return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${sev.solid}" />
      <circle cx="${cx}" cy="${cy}" r="${rad - 1}" fill="none" stroke="${sev.on}" stroke-width="2" />
      ${glyph(shapes, cx, cy, size * 0.56, sev.on)}`;
}

function phoneFrame() {
  const rowTop = SCREEN.y + 26;
  const rowH = 62;
  const rows = [SEV.repairSoon, SEV.driveOn]
    .map((sev, i) => {
      const cy = rowTop + 24 + i * rowH;
      const divider =
        i === 0
          ? ""
          : `<line x1="${SCREEN.x}" y1="${cy + 24}" x2="${SCREEN.x + SCREEN.w}" y2="${cy + 24}"
        stroke="${WHITE}" stroke-opacity="0.08" stroke-width="1" />`;
      return `${divider}
      ${lamp(sev, SX + 20, cy, 40)}
      <text x="${SX + 52}" y="${cy + 6}" fill="${sev.fg}" font-family="${MONO}"
        font-size="17" font-weight="600" letter-spacing="1.2">${sev.label}</text>`;
    })
    .join("\n      ");
  const codeY = rowTop + 24 + 2 * rowH + 44;
  return `  <!-- Motif 2 + 6: the backlit bezel around a data plate. The frame holds the
       real verdict words and one real marketing sample code — nothing here is
       invented, and the caption says it is a sample screen. -->
  <g>
    <rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.w}" height="${PHONE.h}"
      rx="${PHONE.r}" fill="${NAVY_900}" stroke="${WHITE}" stroke-opacity="0.14"
      stroke-width="1" />
    <path d="M${PHONE.x + PHONE.r} ${PHONE.y + 1.5}h${PHONE.w - PHONE.r * 2}"
      stroke="${WHITE}" stroke-opacity="0.16" stroke-width="1" fill="none" />
    <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}"
      rx="${SCREEN.r}" fill="${NAVY_950}" stroke="${WHITE}" stroke-opacity="0.08"
      stroke-width="1" />
    <!-- Motif 4, the service-procedure legend: uppercase, mono, amber. -->
    <text x="${SX}" y="${SCREEN.y + 30}" fill="${AMBER_300}" font-family="${MONO}"
      font-size="12" font-weight="600" letter-spacing="1.4">VERDICT</text>
    <line x1="${SCREEN.x}" y1="${SCREEN.y + 46}" x2="${SCREEN.x + SCREEN.w}"
      y2="${SCREEN.y + 46}" stroke="${WHITE}" stroke-opacity="0.08"
      stroke-width="1" />
      ${rows}
    <line x1="${SCREEN.x}" y1="${codeY - 26}" x2="${SCREEN.x + SCREEN.w}"
      y2="${codeY - 26}" stroke="${WHITE}" stroke-opacity="0.08" stroke-width="1" />
    <text x="${SX}" y="${codeY}" fill="${WHITE}" font-family="${MONO}"
      font-size="26" font-weight="600" letter-spacing="1.6">P0301</text>
    <text x="${SX}" y="${codeY + 24}" fill="${SLATE_300}" font-family="Inter"
      font-size="15" font-weight="500">Cylinder 1 is misfiring</text>
    <text x="${SX}" y="${codeY + 46}" fill="${SLATE_400}" font-family="${MONO}"
      font-size="12" letter-spacing="0.6">sample screen</text>
  </g>`;
}

/* ------------------------------------------------------------------ */
/* The graphic                                                        */
/* ------------------------------------------------------------------ */
function graphic(embed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
  viewBox="0 0 ${W} ${H}" role="img"
  aria-label="iMechanic — from fault code to completed repair">
  <title>iMechanic — From fault code to completed repair</title>
  <!-- Generated by scripts/gen-feature-graphic.mjs. Do not hand-edit: re-run it. -->
  <defs>
${fontCss(embed)}
    <!-- Motif 8, the technical grid: 3.5% hairlines on a 56px cell, faded out
         before the edges exactly as .im-techgrid does on the site. -->
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
    <!-- The horizon glow: the light the instrument is lit by. -->
    <radialGradient id="horizon" gradientUnits="userSpaceOnUse"
      cx="512" cy="540" r="900"
      gradientTransform="translate(512 540) scale(1 0.4) translate(-512 -540)">
      <stop offset="0" stop-color="${BRAND}" stop-opacity="0.16" />
      <stop offset="0.42" stop-color="${BRAND}" stop-opacity="0.055" />
      <stop offset="0.75" stop-color="${BRAND}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${NAVY_950}" />
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)" />
  <rect width="${W}" height="${H}" fill="url(#horizon)" />
  <!-- Motif 2, the backlit bezel: one lit hairline along the top edge. -->
  <line x1="0" y1="0.5" x2="${W}" y2="0.5" stroke="${WHITE}"
    stroke-opacity="0.12" stroke-width="1" />
  <!-- Brand row: the amber tile + engine mark the app header and the installed
       icon use, so the graphic is recognisably the same product. -->
  <g>
    <rect x="${PAD}" y="40" width="46" height="46" rx="11" fill="${BRAND}" />
    <g transform="translate(${PAD + 10} ${50}) scale(1.1)"
        fill="none" stroke="${ON_BRAND}" stroke-width="${STROKE}"
        stroke-linecap="round" stroke-linejoin="round">${ENGINE_MARK}
    </g>
    <text x="${PAD + 58}" y="72" fill="${WHITE}" font-family="Inter"
      font-size="28" font-weight="700" letter-spacing="-0.4">iMechanic</text>
  </g>
  <!-- The landing page's own words, unchanged. -->
  <text x="${PAD}" y="200" fill="${WHITE}" font-family="Inter"
    font-size="44" font-weight="800" letter-spacing="-1.1">From fault code to</text>
  <text x="${PAD}" y="250" fill="${BRAND}" font-family="Inter"
    font-size="44" font-weight="800" letter-spacing="-1.1">completed repair.</text>
  <line x1="${PAD}" y1="286" x2="${PAD + 470}" y2="286" stroke="${WHITE}"
    stroke-opacity="0.12" stroke-width="1" />
  <text x="${PAD}" y="326" fill="${SLATE_300}" font-family="Inter"
    font-size="19" font-weight="500">Reading codes and clearing them is</text>
  <text x="${PAD}" y="352" fill="${SLATE_200}" font-family="Inter"
    font-size="19" font-weight="700">free, always.</text>
  <text x="${PAD}" y="452" fill="${SLATE_400}" font-family="${MONO}"
    font-size="16" letter-spacing="0.6">imechanic.app</text>
${phoneFrame()}
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
        "design/feature-graphic.svg is still written and can be rasterised anywhere.",
    );
  }
  return found;
}
/** Reads width/height straight out of the PNG IHDR — proof, not assumption. */
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
/** Rasterises through headless Chromium, then asserts the size it claimed. */
function rasterise(svg) {
  const dir = tmpdir();
  const html = join(dir, "imechanic-feature-graphic.html");
  const out = join(dir, "imechanic-feature-graphic.png");
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
  writeFileSync("design/feature-graphic.svg", graphic(false));
  console.log("wrote design/feature-graphic.svg (vector master)");
  const png = rasterise(graphic(true));
  writeFileSync("design/feature-graphic-1024x500.png", png);
  console.log(
    `wrote design/feature-graphic-1024x500.png (${W}x${H}, ${(png.length / 1024).toFixed(1)} KB)`,
  );
}
main();
