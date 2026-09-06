#!/usr/bin/env node
/**
 * Generates the PWA icons as real PNG files, without any image dependency.
 * Run with: npm run icons
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

/**
 * Draws the app mark: a warm gradient ground with a simple armchair silhouette.
 */
function drawIcon(size, { padding = 0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const [r1, g1, b1] = hex('#b5613f');
  const [r2, g2, b2] = hex('#c08a2e');
  const [ri, gi, bi] = hex('#faf7f2');

  const inner = size - padding * 2;
  const radius = padding ? size : inner * 0.24;

  // Armchair geometry, expressed in fractions of the inner square.
  const seat = { x: 0.24, y: 0.5, w: 0.52, h: 0.2 };
  const back = { x: 0.28, y: 0.28, w: 0.44, h: 0.26 };
  const armL = { x: 0.18, y: 0.44, w: 0.09, h: 0.26 };
  const armR = { x: 0.73, y: 0.44, w: 0.09, h: 0.26 };
  const legL = { x: 0.29, y: 0.7, w: 0.05, h: 0.08 };
  const legR = { x: 0.66, y: 0.7, w: 0.05, h: 0.08 };
  const inRect = (u, v, rect) => u >= rect.x && u <= rect.x + rect.w && v >= rect.y && v <= rect.y + rect.h;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const localX = x - padding;
      const localY = y - padding;

      // Rounded-square mask
      const cx = Math.min(Math.max(localX, radius), inner - radius);
      const cy = Math.min(Math.max(localY, radius), inner - radius);
      const distance = Math.hypot(localX - cx, localY - cy);
      const insideSquare = localX >= 0 && localY >= 0 && localX < inner && localY < inner && distance <= radius;

      if (!insideSquare) { rgba[offset + 3] = 0; continue; }

      const t = (localX / inner + localY / inner) / 2;
      let r = Math.round(r1 + (r2 - r1) * t);
      let g = Math.round(g1 + (g2 - g1) * t);
      let b = Math.round(b1 + (b2 - b1) * t);

      const u = localX / inner;
      const v = localY / inner;
      if (inRect(u, v, seat) || inRect(u, v, back) || inRect(u, v, armL) || inRect(u, v, armR) || inRect(u, v, legL) || inRect(u, v, legR)) {
        r = ri; g = gi; b = bi;
      }

      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const files = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  ['maskable-512.png', drawIcon(512, { padding: 54 })],
];
for (const [name, buffer] of files) {
  fs.writeFileSync(path.join(OUT_DIR, name), buffer);
  console.log(`- public/icons/${name} (${(buffer.length / 1024).toFixed(1)} ko)`);
}
