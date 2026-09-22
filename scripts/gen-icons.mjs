/**
 * iMechanic brand icons — deterministic, dependency-free generator.
 *
 * The mark is the engine / MIL pictogram (`EngineIcon` in
 * `src/components/icons.tsx`), not the old spanner. That glyph is the single
 * source of truth: this script parses its `d` attributes straight out of the
 * component and rasterises them itself, so the app mark, the browser-tab icon
 * and the installed PWA icon can never drift apart again.
 *
 *   bun scripts/gen-icons.mjs      (also runs under plain `node`)
 *
 * Why we draw instead of resizing a bitmap master (the previous approach):
 * the old flow resized `design/icon-master.png`, a 1MB AI-generated spanner
 * bitmap, so every shipped icon inherited whatever colours that bitmap
 * happened to use (#011432 navy / #ffaf26 amber — neither is a design token).
 * Rendering the vector mark against the real tokens keeps the palette exact
 * and the output reproducible: same input, byte-identical PNG.
 *
 * Outputs
 *   public/icons/icon-192.png           192  "any"     — manifest
 *   public/icons/icon-512.png           512  "any"     — manifest
 *   public/icons/icon-maskable-512.png  512  maskable  — mark inside the 80% safe circle
 *   public/icons/apple-touch-icon.png   180  opaque    — iOS home screen (D16)
 *   public/favicon.ico                  16/32/48       — tab fallback for /favicon.ico
 *   public/icon.svg                     vector tab icon, navy tile + amber mark
 *   design/engine-mark.svg              vector master (mark only) for store/marketing art
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/* Design tokens (src/styles/app.css). Amber-400 is the brand amber the notes
   already ask the icons to standardise on; navy-950 is also the manifest
   theme_color and the app's header/tab-bar navy, so the install tile finally
   matches the chrome it opens into. */
const NAVY = [0x0b, 0x12, 0x20]; // --color-navy-950
const AMBER = [0xfb, 0xbf, 0x24]; // --color-brand (amber-400)
const NAVY_HEX = "#0b1220";
const AMBER_HEX = "#fbbf24";

/** Stroke weight in viewBox units — matches `base()` in icons.tsx. */
const STROKE = 2;
const VIEWBOX = 24;

/* ------------------------------------------------------------------ */
/* Glyph source: EngineIcon in src/components/icons.tsx                */
/* ------------------------------------------------------------------ */
function readEngineGlyph() {
  const src = readFileSync("src/components/icons.tsx", "utf8");
  const fn = /export function EngineIcon\(props: IconProps\)[\s\S]*?<\/svg>/.exec(
    src,
  );
  if (!fn) {
    throw new Error(
      "EngineIcon not found in src/components/icons.tsx — the brand mark moved?",
    );
  }
  const paths = [...fn[0].matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error("EngineIcon has no <path d> elements");
  return paths.map((d) => ({ d, subpaths: parsePath(d) }));
}

/**
 * Minimal SVG path parser — exactly the commands the icon set uses
 * (M/m L/l H/h V/v Z/z). Anything else throws rather than silently drawing a
 * different mark: the brand icon must never be an approximation of the glyph.
 */
function parsePath(d) {
  const toks = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) ?? [];
  const subs = [];
  let cmd = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cur = null;
  let i = 0;
  const num = () => {
    const v = Number(toks[i++]);
    if (Number.isNaN(v)) throw new Error(`Bad number in path: ${d}`);
    return v;
  };
  const push = () => {
    if (!cur) throw new Error(`Path does not start with M: ${d}`);
    cur.points.push([x, y]);
  };
  while (i < toks.length) {
    const t = toks[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i++;
    } else if (cmd === null) {
      throw new Error(`Path does not start with M: ${d}`);
    }
    switch (cmd) {
      case "M":
      case "m": {
        if (cmd === "m") {
          x += num();
          y += num();
        } else {
          x = num();
          y = num();
        }
        cur = { points: [[x, y]], closed: false };
        subs.push(cur);
        startX = x;
        startY = y;
        // Subsequent coordinate pairs after M/m are implicit linetos.
        cmd = cmd === "m" ? "l" : "L";
        break;
      }
      case "L":
        x = num();
        y = num();
        push();
        break;
      case "l":
        x += num();
        y += num();
        push();
        break;
      case "H":
        x = num();
        push();
        break;
      case "h":
        x += num();
        push();
        break;
      case "V":
        y = num();
        push();
        break;
      case "v":
        y += num();
        push();
        break;
      case "Z":
      case "z":
        cur.closed = true;
        if (x !== startX || y !== startY) push();
        x = startX;
        y = startY;
        cmd = null;
        break;
      default:
        throw new Error(`Unsupported path command "${cmd}" in ${d}`);
    }
  }
  return subs;
}

/** Every stroked segment of the glyph, in viewBox units. */
function segments(glyph) {
  const out = [];
  for (const path of glyph) {
    for (const sub of path.subpaths) {
      const pts = sub.points;
      for (let k = 0; k < pts.length - 1; k++) {
        out.push([pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]]);
      }
    }
  }
  return out;
}

/** Ink bounding box in viewBox units, padded by half the stroke (round caps). */
function inkBox(glyph) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of glyph) {
    for (const sub of path.subpaths) {
      for (const [px, py] of sub.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }
  const pad = STROKE / 2;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/* ------------------------------------------------------------------ */
/* Rasteriser: distance-to-segment coverage = free anti-aliasing       */
/* ------------------------------------------------------------------ */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/**
 * Render the mark into an RGBA buffer: opaque navy plate, amber glyph.
 * `span` is the fraction of the canvas the 24-unit design box occupies; the
 * ink (not the box) is centred, which is what makes a wide pictogram sit still.
 */
function render(size, span, glyph, segs, box) {
  const scale = (span * size) / VIEWBOX;
  const tx = size / 2 - box.cx * scale;
  const ty = size / 2 - box.cy * scale;
  const half = (STROKE * scale) / 2;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ux = (x + 0.5 - tx) / scale;
      const uy = (y + 0.5 - ty) / scale;
      let d = Infinity;
      for (const s of segs) {
        const dd = distToSegment(ux, uy, s[0], s[1], s[2], s[3]);
        if (dd < d) d = dd;
      }
      // Coverage ramps over one device pixel: d is in viewBox units.
      let cov = 0.5 + (half - d * scale);
      cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
      const o = (y * size + x) * 4;
      out[o] = Math.round(NAVY[0] + (AMBER[0] - NAVY[0]) * cov);
      out[o + 1] = Math.round(NAVY[1] + (AMBER[1] - NAVY[1]) * cov);
      out[o + 2] = Math.round(NAVY[2] + (AMBER[2] - NAVY[2]) * cov);
      out[o + 3] = 255;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* PNG / ICO writers                                                   */
/* ------------------------------------------------------------------ */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** ICO container with PNG payloads (every browser we support reads these). */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = [];
  for (const im of images) {
    const e = Buffer.alloc(16);
    e[0] = im.size >= 256 ? 0 : im.size;
    e[1] = im.size >= 256 ? 0 : im.size;
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(im.png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += im.png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/* ------------------------------------------------------------------ */
/* SVG writers                                                         */
/* ------------------------------------------------------------------ */
function svgMark(glyph, span, box) {
  const tx = (VIEWBOX / 2 - box.cx * span).toFixed(3);
  const ty = (VIEWBOX / 2 - box.cy * span).toFixed(3);
  const paths = glyph
    .map((p) => `    <path d="${p.d}" />`)
    .join("\n");
  return `<g fill="none" stroke="${AMBER_HEX}" stroke-width="${STROKE}"
     stroke-linecap="round" stroke-linejoin="round"
     transform="translate(${tx} ${ty}) scale(${span})">
${paths}
  </g>`;
}
function iconSvg(glyph, span, box) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <title>iMechanic</title>
  <rect width="24" height="24" rx="4.6" fill="${NAVY_HEX}" />
  ${svgMark(glyph, span, box)}
</svg>
`;
}
function masterMarkSvg(glyph, span, box) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="512" height="512">
  <title>iMechanic engine mark</title>
  <!-- Transparent background: drop this on any surface. Generated by
       scripts/gen-icons.mjs from EngineIcon in src/components/icons.tsx. -->
  ${svgMark(glyph, span, box)}
</svg>
`;
}

/* ------------------------------------------------------------------ */
function main() {
  const glyph = readEngineGlyph();
  const segs = segments(glyph);
  const box = inkBox(glyph);

  /* `any` icons carry the mark at ~79% of the plate (matching the visual
     weight of the mark it replaces); maskable sits inside the safe circle. */
  const ANY = 0.92;
  const MASKABLE = 0.76;

  const jobs = [
    ["public/icons/icon-512.png", 512, ANY],
    ["public/icons/icon-192.png", 192, ANY],
    ["public/icons/icon-maskable-512.png", 512, MASKABLE],
    ["public/icons/apple-touch-icon.png", 180, ANY],
  ];
  mkdirSync("public/icons", { recursive: true });
  for (const [file, size, span] of jobs) {
    writeFileSync(file, encodePng(size, size, render(size, span, glyph, segs, box)));
    console.log(`wrote ${file} (${size}x${size})`);
  }

  const ico = [16, 32, 48].map((size) => ({
    size,
    png: encodePng(size, size, render(size, 1, glyph, segs, box)),
  }));
  writeFileSync("public/favicon.ico", encodeIco(ico));
  console.log("wrote public/favicon.ico (16, 32, 48)");

  writeFileSync("public/icon.svg", iconSvg(glyph, ANY, box));
  console.log("wrote public/icon.svg");

  mkdirSync("design", { recursive: true });
  writeFileSync("design/engine-mark.svg", masterMarkSvg(glyph, ANY, box));
  console.log("wrote design/engine-mark.svg");
}
main();
