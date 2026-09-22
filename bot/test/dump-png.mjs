import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle } from '../src/renderer.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

function crc32(buf) {
  let c, t = 0;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function indexedToRgba(frame, palette, w) {
  const out = Buffer.alloc(frame.length * 4);
  for (let i = 0; i < frame.length; i++) {
    const c = palette[frame[i]];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

const scenario = process.argv[2] || '1';
const scenarios = {
  1: { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  2: { left: mk(90, 22, 1.5, 'Дракон', '#c0392b'), right: mk(120, 9, 2.5, 'Дима', '#27ae60') },
};
const sc = scenarios[scenario] || scenarios[1];

const r = renderBattle(sc);
const { width, height, palette } = r;
const perRow = 5;
const cols = Math.min(perRow, r.frames.length);
const rows = Math.ceil(r.frames.length / cols);
const gap = 4;
const sheetW = cols * width + (cols + 1) * gap;
const sheetH = rows * height + (rows + 1) * gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

r.frames.forEach((frame, i) => {
  const rgba = indexedToRgba(frame, palette, width);
  const ox = gap + (i % cols) * (width + gap);
  const oy = gap + Math.floor(i / cols) * (height + gap);
  for (let y = 0; y < height; y++) {
    rgba.copy(sheet, ((oy + y) * sheetW + ox) * 4, y * width * 4, (y + 1) * width * 4);
  }
});

const outDir = path.join(process.cwd(), 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `frames-${scenario}.png`);
fs.writeFileSync(file, encodePng(sheet, sheetW, sheetH));
console.log(`wrote ${file} (${sheetW}x${sheetH}), ${r.frames.length} frames`);