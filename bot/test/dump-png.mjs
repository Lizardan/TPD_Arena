import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle } from '../src/renderer.js';
import { encodePng } from './helpers/png.mjs';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

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