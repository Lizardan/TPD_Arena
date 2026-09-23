/**
 * Cost breakdown for one rendered battle.
 *
 * The delta encoder only writes pixels that differ from the previous frame, so
 * its cost scales with *changed pixels*, not with frame size. This script prints
 * that ratio next to the timings, plus the per-frame encode cost split by
 * whether the screen shake was active - the shake shifts the whole background,
 * so those frames are the expensive ones.
 *
 * It also samples the stat ranges the Telegram bot actually rolls (see
 * rollStats in src/index.js) so the reported worst case is one users can hit.
 *
 *   node test/cost.mjs
 */
import { simulateBattle } from '../src/battle.js';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

/** Share of pixels that differ between consecutive frames. */
function changedRatio(frames) {
  let changed = 0;
  let total = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    for (let p = 0; p < b.length; p++) if (a[p] !== b[p]) changed++;
    total += b.length;
  }
  return total ? changed / total : 0;
}

/**
 * Warm the JIT, then take the MIN over timed reps. Taking the max (or timing the
 * first call) measures V8 compiling, not the renderer.
 */
function measure(request, reps = 5) {
  for (let i = 0; i < 3; i++) {
    const r = renderBattle(request, FREE_PROFILE);
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
  }
  let best = null;
  for (let i = 0; i < reps; i++) {
    const t1 = performance.now();
    const r = renderBattle(request, FREE_PROFILE);
    const t2 = performance.now();
    const g = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const t3 = performance.now();
    const total = t3 - t1;
    if (!best || total < best.total) {
      best = { total, render: t2 - t1, encode: t3 - t2, bytes: g.length, rendered: r };
    }
  }
  return best;
}

function describe(label, request, info) {
  const battle = simulateBattle(request);
  const r = info.rendered;
  console.log(
    `${label.padEnd(10)} sim ${battle.duration.toFixed(1).padStart(5)}s`
    + ` | ${String(r.frames.length).padStart(2)} frames`
    + ` | ${String(r.timeline.beats).padStart(2)}/${String(r.timeline.totalBeats).padStart(3)} beats`
    + ` | changed ${(changedRatio(r.frames) * 100).toFixed(1).padStart(5)}%`
    + ` | render ${info.render.toFixed(1).padStart(4)} / encode ${info.encode.toFixed(1).padStart(4)}`
    + ` = ${info.total.toFixed(1).padStart(4)}ms | ${String(Math.round(info.bytes / 1024)).padStart(3)} KiB`
    + ` | scale ${r.timeline.attackScale}`,
  );
  return info;
}

const adversarial = [
  ['balanced', { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') }],
  ['fast', { left: mk(50, 30, 5.0, 'FastA', '#ff6b6b'), right: mk(60, 25, 4.0, 'FastB', '#4ecdc4') }],
  ['extreme', { left: mk(999, 1, 10, 'Очень_Длинный_Никнейм', '#ff5555'), right: mk(999, 1, 10, 'Второй_Длинный', '#55ff88') }],
];

console.log('adversarial inputs (only reachable via /render, not via the bot flow)\n');
for (const [name, request] of adversarial) describe(name, request, measure(request));

/* ------------------------------------------------------------------ */
/* What the bot actually produces                                      */
/* ------------------------------------------------------------------ */

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

/** Same ranges as rollStats(): hp 80..180, power 6..26, speed 0.6..1.8. */
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

const SAMPLES = 120;
let worst = null;
for (let s = 1; s <= SAMPLES; s++) {
  const request = realisticFighters(s);
  const info = measure(request, 2);
  if (!worst || info.total > worst.info.total) worst = { request, info, seed: s };
}

console.log(`\nrealistic bot flow: worst of ${SAMPLES} rolled fights\n`);
describe(`seed ${worst.seed}`, worst.request, worst.info);
console.log(
  `  left  hp ${worst.request.left.hp} power ${worst.request.left.attackPower} speed ${worst.request.left.attackSpeed}`
  + `\n  right hp ${worst.request.right.hp} power ${worst.request.right.attackPower} speed ${worst.request.right.attackSpeed}`,
);

/* ------------------------------------------------------------------ */
/* Where the encode time goes                                          */
/* ------------------------------------------------------------------ */

console.log('\nper-frame encode cost of that worst fight (shake re-blits the background)\n');
{
  const r = renderBattle(worst.request, FREE_PROFILE);
  const { width, height } = r;
  const shakeDur = FREE_PROFILE.shakeDur;
  const battle = simulateBattle(worst.request);

  // A frame is "shaken" when an impact is recent enough to move the camera.
  const segs = r.timeline.segments;
  const simAt = (gifT) => {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (gifT <= s.gifT1 || i === segs.length - 1) {
        const span = s.gifT1 - s.gifT0;
        const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (gifT - s.gifT0) / span));
        return s.simT0 + (s.simT1 - s.simT0) * t;
      }
    }
    return 0;
  };
  const isShaken = (simT) => battle.events.some(
    (e) => e.type === 'impact' && simT >= e.t && simT - e.t < shakeDur,
  );

  let shakenPx = 0;
  let calmPx = 0;
  let shakenFrames = 0;
  for (let i = 1; i < r.frames.length; i++) {
    const a = r.frames[i - 1];
    const b = r.frames[i];
    let n = 0;
    for (let p = 0; p < b.length; p++) if (a[p] !== b[p]) n++;
    if (isShaken(simAt(i / FREE_PROFILE.fps))) { shakenPx += n; shakenFrames++; } else { calmPx += n; }
  }
  const calmFrames = r.frames.length - 1 - shakenFrames;
  console.log(`  frames ${r.frames.length}: ${shakenFrames} with shake, ${calmFrames} calm`);
  console.log(`  changed px/frame with shake: ${shakenFrames ? Math.round(shakenPx / shakenFrames) : 0} of ${width * height} (${(100 * (shakenFrames ? shakenPx / shakenFrames : 0) / (width * height)).toFixed(0)}%)`);
  console.log(`  changed px/frame calm:       ${calmFrames ? Math.round(calmPx / calmFrames) : 0} of ${width * height} (${(100 * (calmFrames ? calmPx / calmFrames : 0) / (width * height)).toFixed(0)}%)`);
}
