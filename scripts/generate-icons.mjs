/**
 * Generator ikon PWA tanpa dependency eksternal (decoder/encoder PNG memakai zlib Node).
 * Sumber artwork: public/icons/no-background-mm.png (ganti berkas itu untuk ganti logo).
 * Jalankan: npm run icons
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'public/icons/no-background-mm.png';

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

/** `opaque: true` membuang kanal alpha → PNG RGB (dipakai maskable & ikon iOS). */
function encodePng(size, rgba, { opaque = false } = {}) {
  const channels = opaque ? 3 : 4;
  const stride = size * channels;
  const raw = Buffer.alloc((stride + 1) * size);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const candidate = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);

  const filterScore = (filter, bpp) => {
    let score = 0;
    for (let i = 0; i < stride; i += 1) {
      const value = current[i];
      const left = i >= bpp ? current[i - bpp] : 0;
      const up = previous[i];
      const upLeft = i >= bpp ? previous[i - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      const out = (value - predictor) & 0xff;
      candidate[i] = out;
      score += out < 128 ? out : 256 - out;
    }
    return score;
  };

  for (let y = 0; y < size; y += 1) {
    const sourceRow = y * size * 4;
    for (let x = 0; x < size; x += 1) {
      const s = sourceRow + x * 4;
      const d = x * channels;
      current[d] = rgba[s];
      current[d + 1] = rgba[s + 1];
      current[d + 2] = rgba[s + 2];
      if (!opaque) current[d + 3] = rgba[s + 3];
    }

    let bestFilter = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter <= 4; filter += 1) {
      const score = filterScore(filter, channels);
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        candidate.copy(best);
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    best.copy(raw, y * (stride + 1) + 1);
    current.copy(previous);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // color type RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- decoder PNG minimal (bit depth 8, non-interlaced) ----------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${SOURCE}: bukan berkas PNG`);
  }

  let offset = 8;
  let header;
  let palette;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (!header) throw new Error(`${SOURCE}: IHDR tidak ditemukan`);
  if (header.bitDepth !== 8) {
    throw new Error(`${SOURCE}: hanya bit depth 8 yang didukung`);
  }
  if (header.interlace !== 0) {
    throw new Error(`${SOURCE}: PNG interlaced belum didukung`);
  }

  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[header.colorType];
  if (!channels) {
    throw new Error(`${SOURCE}: color type ${header.colorType} tidak didukung`);
  }

  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const start = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[start + x];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`Filter PNG ${filter} tidak dikenal`);
      pixels[row + x] = (value + predictor) & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const s = i * channels;
    if (header.colorType === 6) {
      data[o] = pixels[s];
      data[o + 1] = pixels[s + 1];
      data[o + 2] = pixels[s + 2];
      data[o + 3] = pixels[s + 3];
    } else if (header.colorType === 2) {
      data[o] = pixels[s];
      data[o + 1] = pixels[s + 1];
      data[o + 2] = pixels[s + 2];
      data[o + 3] = 255;
    } else if (header.colorType === 3) {
      const p = pixels[s] * 3;
      data[o] = palette[p];
      data[o + 1] = palette[p + 1];
      data[o + 2] = palette[p + 2];
      data[o + 3] = 255;
    } else if (header.colorType === 4) {
      data[o] = pixels[s];
      data[o + 1] = pixels[s];
      data[o + 2] = pixels[s];
      data[o + 3] = pixels[s + 1];
    } else {
      data[o] = pixels[s];
      data[o + 1] = pixels[s];
      data[o + 2] = pixels[s];
      data[o + 3] = 255;
    }
  }

  return { width, height, data };
}

// ---------- raster: crop, resample, isi area transparan ----------
/** Potong ke isi artwork (buang margin transparan) lalu ambil persegi di tengahnya. */
function trimToSquare(image) {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${SOURCE}: artwork kosong (semua transparan)`);

  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const side = Math.min(boxWidth, boxHeight);
  const x0 = minX + Math.floor((boxWidth - side) / 2);
  const y0 = minY + Math.floor((boxHeight - side) / 2);

  const cropped = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    const from = ((y0 + y) * width + x0) * 4;
    cropped.set(data.subarray(from, from + side * 4), y * side * 4);
  }
  return { width: side, height: side, data: cropped };
}

/** Downscale box filter dengan rata-rata berbobot alpha (hasil tajam & tanpa halo). */
function resizeSquare(image, size) {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(size * size * 4);
  const scaleX = width / size;
  const scaleY = height / size;

  for (let ty = 0; ty < size; ty += 1) {
    const sy0 = ty * scaleY;
    const sy1 = sy0 + scaleY;
    for (let tx = 0; tx < size; tx += 1) {
      const sx0 = tx * scaleX;
      const sx1 = sx0 + scaleX;
      const xStart = Math.floor(sx0);
      const xEnd = Math.ceil(sx1);
      const yStart = Math.floor(sy0);
      const yEnd = Math.ceil(sy1);

      let weightSum = 0;
      let alphaSum = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let y = yStart; y < yEnd; y += 1) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = xStart; x < xEnd; x += 1) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const i = (y * width + x) * 4;
          const alpha = data[i + 3] / 255;
          const alphaWeight = weight * alpha;
          weightSum += weight;
          alphaSum += alphaWeight;
          r += data[i] * alphaWeight;
          g += data[i + 1] * alphaWeight;
          b += data[i + 2] * alphaWeight;
        }
      }

      const o = (ty * size + tx) * 4;
      if (alphaSum > 0.0001) {
        out[o] = Math.round(r / alphaSum);
        out[o + 1] = Math.round(g / alphaSum);
        out[o + 2] = Math.round(b / alphaSum);
        out[o + 3] = Math.round((alphaSum / weightSum) * 255);
      }
    }
  }
  return out;
}

/**
 * Isi piksel transparan dengan warna terdekat (BFS dari tepi artwork) supaya
 * sudut membulat tetap menyatu saat ikon dipotong launcher / iOS (butuh opaque).
 */
function flattenOntoEdgeColors(size, rgba) {
  const total = size * size;
  const alpha = new Uint8Array(total);
  const color = new Uint8ClampedArray(total * 3);
  const filled = new Uint8Array(total);
  const queue = new Int32Array(total);

  let tail = 0;
  for (let i = 0; i < total; i += 1) {
    const a = rgba[i * 4 + 3];
    alpha[i] = a;
    if (a === 255) {
      color[i * 3] = rgba[i * 4];
      color[i * 3 + 1] = rgba[i * 4 + 1];
      color[i * 3 + 2] = rgba[i * 4 + 2];
      filled[i] = 1;
      queue[tail] = i;
      tail += 1;
    }
  }

  for (let head = 0; head < tail; head += 1) {
    const i = queue[head];
    const x = i % size;
    const y = (i - x) / size;
    const r = color[i * 3];
    const g = color[i * 3 + 1];
    const b = color[i * 3 + 2];
    const neighbors = [
      x > 0 ? i - 1 : -1,
      x < size - 1 ? i + 1 : -1,
      y > 0 ? i - size : -1,
      y < size - 1 ? i + size : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || filled[n]) continue;
      filled[n] = 1;
      color[n * 3] = r;
      color[n * 3 + 1] = g;
      color[n * 3 + 2] = b;
      queue[tail] = n;
      tail += 1;
    }
  }

  if (tail < total) {
    throw new Error(`${SOURCE}: artwork tidak punya piksel opaque untuk latar`);
  }

  const out = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i += 1) {
    const a = alpha[i] / 255;
    const o = i * 4;
    out[o] = Math.round(rgba[o] * a + color[i * 3] * (1 - a));
    out[o + 1] = Math.round(rgba[o + 1] * a + color[i * 3 + 1] * (1 - a));
    out[o + 2] = Math.round(rgba[o + 2] * a + color[i * 3 + 2] * (1 - a));
    out[o + 3] = 255;
  }
  return out;
}

const outputs = [
  { path: 'public/icons/icon-192.png', size: 192, opaque: false },
  { path: 'public/icons/icon-512.png', size: 512, opaque: false },
  // Maskable dibiarkan penuh (full bleed) — launcher memotong sesuai bentuknya sendiri.
  { path: 'public/icons/maskable-512.png', size: 512, opaque: true },
  { path: 'src/app/icon.png', size: 256, opaque: false },
  // Logo untuk branding di dalam aplikasi (sidebar, header, halaman login).
  { path: 'public/icons/logo-128.png', size: 128, opaque: false },
  // iOS menolak transparansi, jadi sudutnya diisi warna tepi artwork.
  { path: 'src/app/apple-icon.png', size: 180, opaque: true },
];

const artwork = trimToSquare(decodePng(readFileSync(join(root, SOURCE))));
console.log(`ℹ sumber ${SOURCE} → ${artwork.width}×${artwork.height} px (setelah trim)`);

for (const output of outputs) {
  const resized = resizeSquare(artwork, output.size);
  const rgba = output.opaque ? flattenOntoEdgeColors(output.size, resized) : resized;
  const filePath = join(root, output.path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, encodePng(output.size, rgba, { opaque: output.opaque }));
  console.log(`✔ ${output.path} (${output.size}×${output.size})`);
}
