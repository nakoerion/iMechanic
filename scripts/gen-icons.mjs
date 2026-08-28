/**
 * Dependency-free PNG codec: decode an 8-bit RGB/RGBA PNG, box-resample to a
 * target size, and re-encode as RGBA PNG. Used to generate the exact PWA icon
 * sizes without adding image dependencies. One-off build tool (not shipped).
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  let off = 8;
  let width, height, bitDepth, colorType, channels;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error(`Unsupported color type ${colorType}`); })();
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels; // 8-bit, so channels == bytes per pixel
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4); // RGBA always
  const prev = Buffer.alloc(stride);
  const rawSub = Buffer.alloc(stride);
  let pos = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? rawSub[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = line[x]; break;
        case 1: v = (line[x] + left) & 0xff; break;
        case 2: v = (line[x] + up) & 0xff; break;
        case 3: v = (line[x] + ((left + up) >> 1)) & 0xff; break;
        case 4: v = (line[x] + paeth(left, up, upLeft)) & 0xff; break;
        default: throw new Error(`Bad filter ${filter}`);
      }
      rawSub[x] = v;
    }
    // write RGBA row
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      out[di] = rawSub[si];
      out[di + 1] = channels >= 2 ? rawSub[si + 1] : rawSub[si];
      out[di + 2] = channels >= 3 ? rawSub[si + 2] : rawSub[si];
      out[di + 3] = channels === 4 ? rawSub[si + 3] : 255;
    }
    prev.set(rawSub);
    pos += stride;
  }
  return { width, height, rgba: out };
}

function resize(rgba, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const ys = (dy * sh) / dh;
    const ye = ((dy + 1) * sh) / dh;
    const y0 = Math.floor(ys), y1 = Math.max(Math.floor(ye - 1e-9), y0);
    for (let dx = 0; dx < dw; dx++) {
      const xs = (dx * sw) / dw;
      const xe = ((dx + 1) * sw) / dw;
      const x0 = Math.floor(xs), x1 = Math.max(Math.floor(xe - 1e-9), x0);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = (y * sw + x) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3];
          n++;
        }
      }
      const di = (dy * dw + dx) * 4;
      out[di] = Math.round(r / n);
      out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n);
      out[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  // Master source asset lives outside public/ so the 1MB original is never
  // shipped to visitors (QA defect D20); only the resized icons are served.
  const src = readFileSync("design/icon-master.png");
  const { width, height, rgba } = decodePng(src);
  console.log(`decoded ${width}x${height}`);
  const jobs = [
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-maskable-512.png", 512],
  ];
  for (const [file, size] of jobs) {
    const resized = resize(rgba, width, height, size, size);
    mkdirSync("public/icons", { recursive: true });
    writeFileSync(file, encodePng(size, size, resized));
    console.log(`wrote ${file} (${size}x${size})`);
  }
}

main();
