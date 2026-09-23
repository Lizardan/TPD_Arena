/**
 * Renders a contact sheet of GIF frames plus the GIF itself, for eyeballing
 * sprite quality, animation smoothness and idle/attack alternation.
 *
 *   node test/sheet.mjs <scenario> [step]
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { simulateBattle } from '../src/battle.js';
import { encodePng } from './helpers/png.mjs';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

const scenarios = {
  1: { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  2: { left: mk(200, 5, 0.8, 'Медведь', '#b0413e'), right: mk(80, 20, 3.0, 'Скороход', '#3ecfb0') },
  3: { left: mk(100, 10, 1.0, 'Equal A', '#ffdf3d'), right: mk(100, 10, 1.0, 'Equal B', '#9d5cff') },
  4: { left: mk(999, 1, 10, 'Очень_Длинный_Ник', '#ff5555'), right: mk(60, 30, 0.5, 'Босс', '#55ff88') },
  5: { left: mk(120, 14, 1.2, 'Дракон', '#c0392b'), right: mk(90, 11, 1.6, 'Аня', '#27ae60') },
};

const scenario = process.argv[2] || '1';
const step = Number(process.argv[3] || 1);
const sc = scenarios[scenario] || scenarios[1];

const r = renderBattle(sc, FREE_PROFILE);
const battle = simulateBattle(sc);
const { width, height, palette } = r;

// Mark each frame with its fighter mode so idle/attack alternation is visible.
const idx = (frame) => {
  const out = Buffer.alloc(frame.length * 4);
  for (let i = 0; i < frame.length; i++) {
    const c = palette[frame[i]];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
};

const picked = [];
for (let i = 0; i < r.frames.length; i += step) picked.push(i);

const perRow = 6;
const gap = 3;
const cols = Math.min(perRow, picked.length);
const rows = Math.ceil(picked.length / cols);
const sheetW = cols * width + (cols + 1) * gap;
const sheetH = rows * height + (rows + 1) * gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
// Neutral dark backdrop so the arena edges are visible.
for (let i = 0; i < sheetW * sheetH; i++) {
  sheet[i * 4] = 40; sheet[i * 4 + 1] = 40; sheet[i * 4 + 2] = 48; sheet[i * 4 + 3] = 255;
}

picked.forEach((fi, n) => {
  const rgba = idx(r.frames[fi]);
  const ox = gap + (n % cols) * (width + gap);
  const oy = gap + Math.floor(n / cols) * (height + gap);
  for (let y = 0; y < height; y++) {
    rgba.copy(sheet, ((oy + y) * sheetW + ox) * 4, y * width * 4, (y + 1) * width * 4);
  }
});

const outDir = path.join(process.cwd(), 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `sheet-${scenario}.png`), encodePng(sheet, sheetW, sheetH));

const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
fs.writeFileSync(path.join(outDir, `battle-${scenario}.gif`), gif);

console.log(`scenario ${scenario}: sim ${battle.duration.toFixed(2)}s -> gif ${(r.frames.length / FREE_PROFILE.fps).toFixed(2)}s`);
console.log(`  frames ${r.frames.length}, ${width}x${height}, palette ${r.palette.length}, gif ${gif.length} bytes`);
console.log(`  sheet-${scenario}.png (${picked.length} frames, step ${step}) + battle-${scenario}.gif`);
