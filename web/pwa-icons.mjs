/* Portable PWA icon export from Droply's original PNG, with zero extra
   build dependencies. Generates correctly sized 192/512 PNG icons for
   Chromium's installability checks; original branding remains unchanged. */
import { inflateSync, deflateSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([size, tag, data, crc]);
}
function imagePixels(png) {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw Error('Droply icon is not a PNG');
  let width = 0, height = 0, depth = 0, color = 0, interlace = 0, palette, alpha;
  const compressed = [];
  for (let pos = 8; pos + 12 <= png.length;) {
    const size = png.readUInt32BE(pos), type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + size);
    pos += 12 + size;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') alpha = data;
    else if (type === 'IEND') break;
  }
  if (!width || !height || width > 4096 || height > 4096 || !CHANNELS[color] ||
      ![1,2,4,8].includes(depth) || (color !== 0 && color !== 3 && depth !== 8) ||
      interlace !== 0 || !compressed.length)
    throw Error('Unsupported source PNG format for Droply app icon');
  const bits = CHANNELS[color] * depth;
  const stride = Math.ceil(width * bits / 8);
  const bpp = Math.max(1, Math.ceil(bits / 8));
  const uncompressed = inflateSync(Buffer.concat(compressed));
  if (uncompressed.length !== (stride + 1) * height) throw Error('Invalid source PNG data');
  const image = Buffer.alloc(width * height * 4);
  let old = Buffer.alloc(stride), offset = 0;
  function sample(row, x, bitDepth) {
    if (bitDepth === 8) return row[x];
    const byte = row[Math.floor(x * bitDepth / 8)];
    const shift = 8 - bitDepth - ((x * bitDepth) % 8);
    return (byte >>> shift) & ((1 << bitDepth) - 1);
  }
  for (let y = 0; y < height; y++) {
    const filter = uncompressed[offset++];
    const source = uncompressed.subarray(offset, offset + stride);
    offset += stride;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = old[x], upLeft = x >= bpp ? old[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >>> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      } else if (filter !== 0) throw Error('Invalid PNG filter');
      row[x] = (source[x] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      if (color === 6) {
        const at = x * 4; for (let c = 0; c < 4; c++) image[out + c] = row[at + c];
      } else if (color === 2) {
        const at = x * 3;
        image[out] = row[at]; image[out + 1] = row[at + 1]; image[out + 2] = row[at + 2]; image[out + 3] = 255;
      } else if (color === 4) {
        const at = x * 2;
        image[out] = image[out + 1] = image[out + 2] = row[at]; image[out + 3] = row[at + 1];
      } else if (color === 3) {
        const index = sample(row, x, depth);
        if (!palette || index * 3 + 2 >= palette.length) throw Error('Invalid indexed PNG palette');
        image[out] = palette[index * 3]; image[out + 1] = palette[index * 3 + 1];
        image[out + 2] = palette[index * 3 + 2]; image[out + 3] = alpha?.[index] ?? 255;
      } else {
        const gray = Math.round(sample(row, x, depth) * 255 / ((1 << depth) - 1));
        image[out] = image[out + 1] = image[out + 2] = gray;
        image[out + 3] = 255;
      }
    }
    old = row;
  }
  return { width, height, image };
}
function encodeIcon(source, size) {
  const bytes = Buffer.alloc(size * (1 + size * 4));
  const {width, height, image} = source;
  // Bilinear interpolation avoids jagged lines in the small Home Screen icon.
  const sample = (px, py, channel) => image[(py * width + px) * 4 + channel];
  for (let y = 0; y < size; y++) {
    const yf = Math.max(0, Math.min(height - 1, (y + .5) * height / size - .5));
    const y0 = Math.floor(yf), y1 = Math.min(y0 + 1, height - 1), dy = yf - y0;
    for (let x = 0; x < size; x++) {
      const xf = Math.max(0, Math.min(width - 1, (x + .5) * width / size - .5));
      const x0 = Math.floor(xf), x1 = Math.min(x0 + 1, width - 1), dx = xf - x0;
      for (let channel = 0; channel < 4; channel++) {
        const top = sample(x0,y0,channel) * (1 - dx) + sample(x1,y0,channel) * dx;
        const bottom = sample(x0,y1,channel) * (1 - dx) + sample(x1,y1,channel) * dx;
        bytes[y * (1 + size * 4) + 1 + x * 4 + channel] =
          Math.round(top * (1 - dy) + bottom * dy);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size,0); header.writeUInt32BE(size,4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([SIGNATURE,chunk('IHDR',header),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]);
}
export async function exportPwaIcons(root, output) {
  const original = imagePixels(await readFile(join(root,'assets','droply-icon.png')));
  await Promise.all([192,512].map(size =>
    writeFile(join(output, 'droply-icon-' + size + '.png'), encodeIcon(original,size))));
}
