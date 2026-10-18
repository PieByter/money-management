/**
 * Generator ikon PWA tanpa dependency eksternal (encoder PNG memakai zlib Node).
 * Jalankan: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- encoder PNG minimal ----------
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
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- rasterizer sederhana dengan supersampling 2x2 ----------
function blendPixel(canvas, x, y, color, alpha) {
  if (alpha <= 0.002) return;
  const i = (y * canvas.size + x) * 4;
  const dstA = canvas.data[i + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    const dst = canvas.data[i + c];
    canvas.data[i + c] = Math.round(
      (color[c] * alpha + dst * dstA * (1 - alpha)) / outA,
    );
  }
  canvas.data[i + 3] = Math.round(outA * 255);
}

function drawShape(canvas, test, color) {
  const S = 2;
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < S; sy += 1) {
        for (let sx = 0; sx < S; sx += 1) {
          const ux = (x + (sx + 0.5) / S) / canvas.size;
          const uy = (y + (sy + 0.5) / S) / canvas.size;
          if (test(ux, uy)) hits += 1;
        }
      }
      if (hits > 0) blendPixel(canvas, x, y, color, hits / (S * S));
    }
  }
}

const roundedRect = (inset, radius) => (x, y) => {
  const x0 = inset;
  const y0 = inset;
  const x1 = 1 - inset;
  const y1 = 1 - inset;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
};

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const EMERALD = [5, 150, 105];
const EMERALD_DARK = [4, 108, 78];
const WHITE = [255, 255, 255];

/** Dua koin bertumpuk di atas latar emerald—logo sederhana aplikasi keuangan. */
function renderIcon(size, { maskable = false } = {}) {
  const canvas = { size, data: new Uint8ClampedArray(size * size * 4) };
  if (maskable) {
    drawShape(canvas, () => true, EMERALD);
  } else {
    drawShape(canvas, roundedRect(0.02, 0.2), EMERALD);
  }

  const scale = maskable ? 0.66 : 0.84;
  const scalePoint = (x, y) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale];
  const shape = (fn) => (x, y) => {
    const [ux, uy] = scalePoint(x, y);
    return fn(ux, uy);
  };

  drawShape(canvas, shape(circle(0.44, 0.57, 0.2)), EMERALD_DARK);
  drawShape(canvas, shape(circle(0.59, 0.43, 0.165)), WHITE);
  drawShape(canvas, shape(circle(0.44, 0.57, 0.165)), WHITE);
  drawShape(canvas, shape(circle(0.44, 0.57, 0.05)), EMERALD);
  return canvas;
}

const outputs = [
  { path: 'public/icons/icon-192.png', size: 192, maskable: false },
  { path: 'public/icons/icon-512.png', size: 512, maskable: false },
  { path: 'public/icons/maskable-512.png', size: 512, maskable: true },
  { path: 'src/app/icon.png', size: 256, maskable: false },
  { path: 'src/app/apple-icon.png', size: 180, maskable: true },
];

for (const output of outputs) {
  const canvas = renderIcon(output.size, { maskable: output.maskable });
  const filePath = join(root, output.path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, encodePng(output.size, canvas.data));
  console.log(`✔ ${output.path}`);
}
