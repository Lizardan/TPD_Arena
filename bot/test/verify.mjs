/**
 * End-to-end visual verification for one battle.
 *
 * Prints the frame-by-frame state table (so idle/attack alternation is
 * auditable in text, not just by eye), writes an inspection sheet, writes the
 * GIF and re-decodes it to prove the delta frames rebuild the exact pixels.
 *
 *   node test/verify.mjs [scenario]
 *
 * Scenarios:
 *   realistic  the sweep's worst case from the bot's own stat ranges
 *   grind      180 HP traded 6 at a time - the long-fight case
 *   nicknames  two maximum-length nicknames
 *   frantic    the adversarial 999 HP / speed 10 input
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { simulateBattle } from '../src/battle.js';
import { computeFighterState } from '../src/fighter.js';
import { decodeGif } from './helpers/decode-gif.mjs';
import { encodePng, contactSheet } from './helpers/png.mjs';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same ranges as rollStats() in src/index.js. */
function realisticFighters(seed) {
  const rand = mulberry32(seed);
  const make = (name) => ({
    name,
    hp: 80 + Math.floor(rand() * 101),
    attackPower: 6 + Math.floor(rand() * 21),
    attackSpeed: Math.round((0.6 + rand() * 1.2) * 10) / 10,
  });
  return { left: make('Игрок'), right: make('Соперник') };
}

const scenarios = {
  realistic: { request: realisticFighters(34), note: 'worst case across 120 rolled fights' },
  grind: { request: { left: mk(180, 6, 0.6, 'Танк', '#8888ff'), right: mk(180, 6, 0.6, 'Стена', '#ffaa44') }, note: 'long fight, ~60 swings' },
  nicknames: {
    request: { left: mk(120, 10, 1.2, 'Очень_Длинный_Никнейм', '#ff5555'), right: mk(140, 9, 1.0, 'Второй_Длинный_Ник', '#55ff88') },
    note: 'maximum-length nicknames',
  },
  frantic: { request: { left: mk(999, 1, 10, 'A', '#ff5555'), right: mk(999, 1, 10, 'B', '#55ff88') }, note: 'adversarial input' },
};

const key = process.argv[2] || 'realistic';
const scenario = scenarios[key];
if (!scenario) {
  console.error(`unknown scenario "${key}". options: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}
const request = scenario.request;

const r = renderBattle(request, FREE_PROFILE);
const battle = simulateBattle(request);
const segs = r.timeline.segments;
const simAt = r.timeline.simAt;

const CODE = { idle: 'i', attack: 'a', hurt: 'h', dead: 'd' };

console.log(`scenario: ${key} — ${scenario.note}`);
console.log(`sim ${battle.duration.toFixed(2)}s -> gif ${(r.frames.length / FREE_PROFILE.fps).toFixed(2)}s`
  + ` | ${r.frames.length} frames @ ${FREE_PROFILE.fps}fps`
  + ` | beats ${r.timeline.beats}/${r.timeline.totalBeats}`
  + ` | attackScale ${r.timeline.attackScale} | gap ${(r.timeline.idleCap * FREE_PROFILE.fps).toFixed(0)}f`);
console.log(`winner: ${battle.winner ? battle.fighters[battle.winner].name : '(none - time limit)'}\n`);

const rows = [];
for (let g = 0; g < r.frames.length; g++) {
  const gifT = g / FREE_PROFILE.fps;
  const simT = simAt(gifT);
  const L = computeFighterState(battle, 'left', simT);
  const R = computeFighterState(battle, 'right', simT);
  const seg = segs.find((s) => gifT >= s.gifT0 && gifT < s.gifT1) || segs[segs.length - 1];
  rows.push({ g, kind: seg.kind, simT, L: CODE[L.mode], R: CODE[R.mode], hpL: L.hp, hpR: R.hp, attackP: L.attackP });
}

console.log('frame  seg     simT     L R   hp L/R');
for (const row of rows) {
  console.log(
    `${String(row.g).padStart(5)}  ${row.kind.padEnd(6)} ${row.simT.toFixed(2).padStart(6)}`
    + `   ${row.L} ${row.R}   ${String(row.hpL).padStart(3)}/${String(row.hpR).padStart(3)}`,
  );
}

const bothIdle = rows.filter((x) => x.L === 'i' && x.R === 'i').length;
const anyAttack = rows.filter((x) => x.L === 'a' || x.R === 'a').length;
console.log(`\nboth idle: ${bothIdle} frames | at least one attacking: ${anyAttack} frames`
  + ` | action segments: ${segs.filter((s) => s.kind === 'action').length}`);
if (bothIdle === 0) console.log('WARNING: no frame shows both fighters waiting - idle state is never visible');

/* ------------------------------------------------------------------ */
/* Inspection sheets                                                   */
/* ------------------------------------------------------------------ */

const outDir = path.join(process.cwd(), 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });

const spread = [];
const step = Math.max(1, Math.floor(r.frames.length / 24));
for (let i = 0; i < r.frames.length; i += step) spread.push(i);
if (spread[spread.length - 1] !== r.frames.length - 1) spread.push(r.frames.length - 1);

const sheetA = contactSheet({ ...r, picks: spread, zoom: 2, cols: 5 });
const fileA = path.join(outDir, `verify-${key}-flow.png`);
fs.writeFileSync(fileA, encodePng(sheetA.sheet, sheetA.sheetW, sheetA.sheetH));
console.log(`\nflow sheet  (${spread.length} frames, 2x) -> ${fileA} (${sheetA.sheetW}x${sheetA.sheetH})`);

// Detail sheet: every frame of the first action beat, plus the idle beat before
// it, so the windup -> strike -> recover arc is visible frame by frame.
const firstAction = segs.findIndex((s) => s.kind === 'action');
const detailStart = Math.max(0, Math.floor((segs[firstAction - 1] || segs[firstAction]).gifT0 * FREE_PROFILE.fps));
const detailEnd = Math.min(r.frames.length - 1, Math.ceil(segs[firstAction].gifT1 * FREE_PROFILE.fps) + 1);
const detail = [];
for (let i = detailStart; i <= detailEnd; i++) detail.push(i);
const sheetB = contactSheet({ ...r, picks: detail, zoom: 4, cols: Math.min(6, detail.length) });
const fileB = path.join(outDir, `verify-${key}-beat.png`);
fs.writeFileSync(fileB, encodePng(sheetB.sheet, sheetB.sheetW, sheetB.sheetH));
console.log(`beat sheet  (frames ${detail[0]}-${detail[detail.length - 1]}, 4x) -> ${fileB} (${sheetB.sheetW}x${sheetB.sheetH})`);

/* ------------------------------------------------------------------ */
/* GIF + round-trip                                                    */
/* ------------------------------------------------------------------ */

const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
const gifFile = path.join(outDir, `battle-${key}.gif`);
fs.writeFileSync(gifFile, gif);

const decoded = decodeGif(gif);
let worstMismatch = 0;
let badFrames = 0;
for (let i = 0; i < r.frames.length; i++) {
  const a = r.frames[i];
  const b = decoded.frames[i].indices;
  let bad = 0;
  for (let p = 0; p < a.length; p++) if (a[p] !== b[p]) bad++;
  if (bad > 0) { badFrames++; worstMismatch = Math.max(worstMismatch, bad); }
}
console.log(`\ngif         ${gifFile} (${(gif.length / 1024).toFixed(0)} KiB)`);
console.log(`round-trip  ${decoded.frames.length} frames decoded | mismatching frames: ${badFrames} (worst ${worstMismatch} px)`);
if (badFrames > 0) {
  console.log('FAIL: delta encoding corrupts pixels');
  process.exit(1);
}
