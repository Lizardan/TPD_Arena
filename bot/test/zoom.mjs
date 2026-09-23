/**
 * Renders a zoomed contact sheet of specific frames so sprite anatomy can be
 * inspected pixel by pixel.
 *
 *   node test/zoom.mjs <scenario> <zoom> <frame,frame,...>
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { simulateBattle } from '../src/battle.js';
import { encodePng } from './helpers/png.mjs';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

const scenarios = {
  1: { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  2: { left: mk(200, 5, 0.8, 'Медведь', '#b0413e'), right: mk(80, 20, 3.0, 'Скороход', '#3ecfb0') },
  3: { left: mk(100, 10, 1.0, 'Equal A', '#ffdf3d'), right: mk(100, 10, 1.0, 'Equal B', '#9d5cff') },
  4: { left: mk(999, 1, 10, 'Очень_Длинный_Ник', '#ff5555'), right: mk(60, 30, 0.5, 'Босс', '#55ff88') },
};

const scenario = process.argv[2] || '1';
const zoom = Number(process.argv[3] || 4);
const sc = scenarios[scenario] || scenarios[1];
const r = renderBattle(sc, FREE_PROFILE);
const battle = simulateBattle(sc);

let picks = process.argv[4]
  ? process.argv[4].split(',').map(Number)
  : [0, Math.floor(r.frames.length / 3), Math.floor(r.frames.length / 2), r.frames.length - 1];
picks = picks.filter((i) => i >= 0 && i < r.frames.length);
if (picks.length === 0) picks = [0];

const { width, height, palette } = r;
const gap = 2;
const cols = Math.min(4, picks.length);
const rows = Math.ceil(picks.length / cols);
const zw = width * zoom;
const zh = height * zoom;
const sheetW = cols * zw + (cols + 1) * gap;
const sheetH = rows * zh + (rows + 1) * gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
for (let i = 0; i < sheetW * sheetH; i++) {
  sheet[i * 4] = 40; sheet[i * 4 + 1] = 40; sheet[i * 4 + 2] = 48; sheet[i * 4 + 3] = 255;
}

picks.forEach((fi, n) => {
  const frame = r.frames[fi];
  const ox = gap + (n % cols) * (zw + gap);
  const oy = gap + Math.floor(n / cols) * (zh + gap);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = palette[frame[y * width + x]];
      for (let dy = 0; dy < zoom; dy++) {
        for (let dx = 0; dx < zoom; dx++) {
          const p = ((oy + y * zoom + dy) * sheetW + ox + x * zoom + dx) * 4;
          sheet[p] = c[0]; sheet[p + 1] = c[1]; sheet[p + 2] = c[2]; sheet[p + 3] = 255;
        }
      }
    }
  }
});

const outDir = path.join(process.cwd(), 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `zoom-${scenario}.png`);
fs.writeFileSync(file, encodePng(sheet, sheetW, sheetH));
console.log(`frames ${picks.join(', ')} of ${r.frames.length} | zoom ${zoom}x -> ${file} (${sheetW}x${sheetH})`);
console.log(`sim ${battle.duration.toFixed(2)}s, gif ${(r.frames.length / FREE_PROFILE.fps).toFixed(2)}s`);
