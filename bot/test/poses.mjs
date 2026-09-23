/**
 * Renders the fighter sprite across animation phases, isolated from the battle,
 * so pose quality can be judged directly (idle breathing, attack windup/strike/
 * recover, hurt, death) without hit flashes or overlapping effects.
 *
 *   node test/poses.mjs [zoom]
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { drawFighter, FIG, computePose } from '../src/fighter.js';
import { C, buildPalette, ramp } from '../src/palette.js';
import { encodePng } from './helpers/png.mjs';

const zoom = Number(process.argv[2] || 4);
const W = 68;
const H = 78;
const FLOOR_Y = 64;

const palette = buildPalette([255, 155, 61], [77, 166, 255]);
const rampColors = {
  base: C.L_BASE, dark: C.L_DARK, darker: C.L_DARKER, light: C.L_LIGHT, lighter: C.L_LIGHTER,
};
const rampColorsR = {
  base: C.R_BASE, dark: C.R_DARK, darker: C.R_DARKER, light: C.R_LIGHT, lighter: C.R_LIGHTER,
};

function makeState(mode, p, simT = 0) {
  return {
    side: 'left', name: 'X', hp: 100, maxHp: 100, ghostHp: 100,
    mode, attackP: p, attackAnim: 0.5, hitFlash: 0, hurtP: p, deadP: p,
    dead: mode === 'dead', simT, lastAttackT: -1, lastHitT: -1,
  };
}

const cells = [];
// Idle across a breathing cycle.
for (const t of [0, 0.2, 0.4, 0.6]) cells.push(['idle', makeState('idle', 0, t), rampColors, 'sword']);
// Attack: windup -> strike -> recover.
for (const p of [0.05, 0.2, 0.34, 0.42, 0.5, 0.56, 0.7, 0.88]) {
  cells.push(['atk ' + p.toFixed(2), makeState('attack', p), rampColors, 'sword']);
}
// Hurt and death, plus the other two weapons.
for (const p of [0.2, 0.5, 0.8]) cells.push(['hurt ' + p.toFixed(1), makeState('hurt', p), rampColors, 'sword']);
for (const p of [0.15, 0.4, 0.7, 1]) cells.push(['dead ' + p.toFixed(2), makeState('dead', p), rampColors, 'sword']);
cells.push(['mace idle', makeState('idle', 0, 0.3), rampColorsR, 'mace']);
cells.push(['mace atk', makeState('attack', 0.5), rampColorsR, 'mace']);
cells.push(['spear idle', makeState('idle', 0, 0.3), rampColorsR, 'spear']);
cells.push(['spear atk', makeState('attack', 0.5), rampColorsR, 'spear']);

const cols = 6;
const rows = Math.ceil(cells.length / cols);
const gap = 1;
const cw = W * zoom;
const ch = H * zoom;
const sheetW = cols * cw + (cols + 1) * gap;
const sheetH = rows * ch + (rows + 1) * gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
for (let i = 0; i < sheetW * sheetH; i++) {
  sheet[i * 4] = 30; sheet[i * 4 + 1] = 32; sheet[i * 4 + 2] = 44; sheet[i * 4 + 3] = 255;
}

cells.forEach(([, st, rc, weapon], n) => {
  const buf = new Uint8Array(W * H);
  buf.fill(C.sky2);
  // Simple ground line for reference.
  for (let x = 0; x < W; x++) {
    buf[FLOOR_Y * W + x] = C.floorLine;
    for (let y = FLOOR_Y + 1; y < H; y++) buf[y * W + x] = C.floor0;
  }
  drawFighter(buf, W, H, FLOOR_Y, Math.round(W / 2), 1, st, rc, weapon);

  const ox = gap + (n % cols) * (cw + gap);
  const oy = gap + Math.floor(n / cols) * (ch + gap);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = palette[buf[y * W + x]];
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
const file = path.join(outDir, 'poses.png');
fs.writeFileSync(file, encodePng(sheet, sheetW, sheetH));
console.log(`wrote ${file} (${sheetW}x${sheetH}) - ${cells.length} poses, zoom ${zoom}x`);
console.log(`FIG ${JSON.stringify(FIG)}`);
