/**
 * Visual verification of the encoder output: renders the battle GIF, decodes it
 * back to full frames and draws a contact sheet. Also reports any pixel that
 * does not match the source frame, which is how delta-frame bugs surface.
 *
 *   node test/gif-decode.mjs <scenario> [step]
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { decodeGif } from './helpers/decode-gif.mjs';
import { encodePng } from './helpers/png.mjs';

const scenario = process.argv[2] || '1';
const step = Number(process.argv[3] || 6);
const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });
const scenarios = {
  1: { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  2: { left: mk(200, 5, 0.8, 'Медведь', '#b0413e'), right: mk(80, 20, 3.0, 'Скороход', '#3ecfb0') },
  3: { left: mk(100, 10, 1.0, 'Equal A', '#ffdf3d'), right: mk(100, 10, 1.0, 'Equal B', '#9d5cff') },
  4: { left: mk(999, 1, 10, 'Очень_Длинный_Ник', '#ff5555'), right: mk(60, 30, 0.5, 'Босс', '#55ff88') },
};
const sc = scenarios[scenario] || scenarios[1];

const r = renderBattle(sc, FREE_PROFILE);
const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
const decoded = decodeGif(gif);

let mismatches = 0;
let worstBad = 0;
for (let i = 0; i < Math.min(decoded.frames.length, r.frames.length); i++) {
  const src = r.frames[i];
  const got = decoded.frames[i].indices;
  let bad = 0;
  for (let k = 0; k < src.length; k++) if (src[k] !== got[k]) bad++;
  if (bad > 0) {
    mismatches++;
    worstBad = Math.max(worstBad, bad);
    console.log(`  frame ${i}: ${bad} differing pixels`);
  }
}
console.log(`gif ${gif.length} bytes | ${decoded.frames.length} frames decoded | mismatching frames: ${mismatches} (worst ${worstBad} px)`);

const picked = [];
for (let i = 0; i < decoded.frames.length; i += step) picked.push(i);
const cols = Math.min(6, picked.length);
const rows = Math.ceil(picked.length / cols);
const gap = 2;
const sheetW = cols * decoded.width + (cols + 1) * gap;
const sheetH = rows * decoded.height + (rows + 1) * gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
for (let i = 0; i < sheetW * sheetH; i++) {
  sheet[i * 4] = 40; sheet[i * 4 + 1] = 40; sheet[i * 4 + 2] = 48; sheet[i * 4 + 3] = 255;
}
picked.forEach((fi, n) => {
  const fr = decoded.frames[fi];
  const ox = gap + (n % cols) * (decoded.width + gap);
  const oy = gap + Math.floor(n / cols) * (decoded.height + gap);
  for (let y = 0; y < decoded.height; y++) {
    for (let x = 0; x < decoded.width; x++) {
      const idx = fr.indices[y * decoded.width + x];
      const c = fr.table[idx] || [0, 0, 0];
      const o = ((oy + y) * sheetW + ox + x) * 4;
      sheet[o] = c[0]; sheet[o + 1] = c[1]; sheet[o + 2] = c[2]; sheet[o + 3] = 255;
    }
  }
});

const outDir = path.join(process.cwd(), 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `decoded-${scenario}.png`);
fs.writeFileSync(file, encodePng(sheet, sheetW, sheetH));
fs.writeFileSync(path.join(outDir, `battle-${scenario}.gif`), gif);
console.log(`wrote ${file} and battle-${scenario}.gif (delay ${r.delayMs}ms, ${(decoded.frames.length / FREE_PROFILE.fps).toFixed(2)}s)`);
