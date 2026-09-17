import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const ACCENT_A = [0x5b, 0x8d, 0xef];
const ACCENT_B = [0x7f, 0x5b, 0xef];

function sample(x, y, size, maskable) {
  const nx = x / size;
  const ny = y / size;
  const t = (nx + ny) / 2;
  const bg = [
    lerp(ACCENT_A[0], ACCENT_B[0], t),
    lerp(ACCENT_A[1], ACCENT_B[1], t),
    lerp(ACCENT_A[2], ACCENT_B[2], t),
  ];

  if (maskable) {
    const scale = 0.68;
    const gx = (nx - 0.5) / scale + 0.5;
    const gy = (ny - 0.5) / scale + 0.5;
    return glyphOrBackground(bg, gx, gy);
  }

  const radius = 0.22;
  const dx = Math.max(radius - nx, 0, nx - (1 - radius));
  const dy = Math.max(radius - ny, 0, ny - (1 - radius));
  if (Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];
  return glyphOrBackground(bg, nx, ny);
}

function glyphOrBackground(bg, nx, ny) {
  const cx = 0.5;
  const halfWidth = 0.17;
  const top = 0.27;
  const bottom = 0.75;
  const notch = 0.17;
  const offset = Math.abs(nx - cx);
  const edge = bottom - notch * Math.max(0, 1 - offset / halfWidth);
  if (offset <= halfWidth && ny >= top && ny <= edge) {
    return [255, 255, 255, 255];
  }
  return [bg[0], bg[1], bg[2], 255];
}

function render(size, maskable = false) {
  const ss = 3;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [pr, pg, pb, pa] = sample(
            x + (sx + 0.5) / ss,
            y + (sy + 0.5) / ss,
            size,
            maskable
          );
          r += pr;
          g += pg;
          b += pb;
          a += pa;
        }
      }
      const n = ss * ss;
      const index = (y * size + x) * 4;
      const alpha = a / n;
      out[index] = Math.round(r / n);
      out[index + 1] = Math.round(g / n);
      out[index + 2] = Math.round(b / n);
      out[index + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, out);
}

const outDir = path.resolve('web/public/icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), render(512, true));
console.log('icons written to', outDir);
