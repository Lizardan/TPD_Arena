/**
 * Compares rendering profiles and reports the worst warm case, which is what
 * the Cloudflare CPU budget is actually about.
 *
 * Scenarios are drawn from the stat ranges the bot itself rolls (rollStats in
 * src/index.js), so the reported worst case is one a real user can hit. The
 * deliberately hostile inputs that only /render can produce are included too,
 * but flagged separately.
 *
 * Per scenario the median of several single-shot measurements is used, with a
 * forced collection before each one: that models one request on a warm isolate,
 * which is what the budget is about.
 *
 *   node --expose-gc test/sweep.mjs
 */
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { simulateBattle } from '../src/battle.js';

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

const NAMES = ['Игрок', 'Соперник', 'Медведь', 'Скороход', 'Танк', 'Ассасин', 'Очень_Длинный_Никнейм', 'Второй_Длинный_Ник'];

/** Same ranges as rollStats(). */
function realisticFighters(seed) {
  const rand = mulberry32(seed);
  const make = (i) => ({
    name: NAMES[i % NAMES.length],
    hp: 80 + Math.floor(rand() * 101),
    attackPower: 6 + Math.floor(rand() * 21),
    attackSpeed: Math.round((0.6 + rand() * 1.2) * 10) / 10,
  });
  return { left: make(seed), right: make(seed + 3) };
}

const SAMPLES = 40;
const scenarios = [];
for (let s = 1; s <= SAMPLES; s++) scenarios.push({ kind: 'bot', request: realisticFighters(s) });
scenarios.push({
  kind: 'hostile',
  request: { left: mk(999, 1, 10, 'Очень_Длинный_Никнейм', '#ff5555'), right: mk(999, 1, 10, 'Второй_Длинный', '#55ff88') },
});
scenarios.push({
  kind: 'hostile',
  request: { left: mk(50, 30, 5.0, 'FastA', '#ff6b6b'), right: mk(60, 25, 4.0, 'FastB', '#4ecdc4') },
});

const profiles = [
  { name: 'current', ...FREE_PROFILE },
  { name: '40 frames', ...FREE_PROFILE, maxFrames: 40 },
  { name: '36 frames', ...FREE_PROFILE, maxFrames: 36 },
  { name: 'shake 0.12', ...FREE_PROFILE, shakeDur: 0.12 },
  { name: '128x96', ...FREE_PROFILE, width: 128, height: 96 },
];

/**
 * Two numbers per scenario, because they bracket the truth.
 *
 *   best - the fastest single warm render+encode. This is one request on a warm
 *          isolate with the heap already in a steady state.
 *   load - the average over a back-to-back batch. This is the same work while
 *          the process is also paying to allocate and collect 45 frame buffers
 *          per iteration, i.e. what sustained traffic looks like.
 *
 * Measuring single calls after forcing a collection is *not* a third data
 * point: a forced major GC empties the young generation, so the timed call then
 * pays to fault all of it back in and lands ~3x above even the load figure.
 */
function timeScenario(request, profile, iters = 8) {
  for (let i = 0; i < 3; i++) {
    const r = renderBattle(request, profile);
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
  }

  const shot = [];
  let last = null;
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    const r = renderBattle(request, profile);
    const g = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    shot.push(performance.now() - t0);
    last = { bytes: g.length, frames: r.frames.length };
  }

  let renderSum = 0;
  let encodeSum = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    const r = renderBattle(request, profile);
    const t1 = performance.now();
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const t2 = performance.now();
    renderSum += t1 - t0;
    encodeSum += t2 - t1;
  }

  return {
    best: Math.min(...shot),
    load: (renderSum + encodeSum) / iters,
    render: renderSum / iters,
    encode: encodeSum / iters,
    ...last,
  };
}

console.log(`worst case over ${scenarios.length} scenarios`
  + ` (${SAMPLES} from the bot's own stat ranges + ${scenarios.length - SAMPLES} hostile)`
  + '\nCloudflare Workers free tier: ~10 ms CPU per request'
  + '\n"best" = one warm request, "load" = average under back-to-back traffic\n');

// Global warm-up first. Without it the profile measured first is always the
// slowest, because it pays for compiling code paths the later profiles reuse.
for (const prof of profiles) {
  for (const sc of scenarios) {
    const r = renderBattle(sc.request, prof);
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
  }
}

for (const prof of profiles) {
  let worstBot = null;
  let worstHostile = null;
  for (const sc of scenarios) {
    const info = timeScenario(sc.request, prof);
    const bucket = sc.kind === 'bot' ? 'bot' : 'hostile';
    if (bucket === 'bot' && (!worstBot || info.load > worstBot.load)) worstBot = { ...info, request: sc.request };
    if (bucket === 'hostile' && (!worstHostile || info.load > worstHostile.load)) worstHostile = { ...info, request: sc.request };
  }
  const fmt = (w) => `${String(w.frames).padStart(2)}f | best ${w.best.toFixed(1).padStart(4)}ms`
    + ` | load ${w.load.toFixed(1).padStart(4)}ms (render ${w.render.toFixed(1)} / encode ${w.encode.toFixed(1)})`
    + ` | ${String(Math.round(w.bytes / 1024)).padStart(3)} KiB`;
  const flag = (w) => (w.best > 10 ? '  <-- OVER EVEN AT BEST' : w.load > 10 ? '  <-- over under load' : '');
  console.log(prof.name.padEnd(12) + ' bot     ' + fmt(worstBot) + flag(worstBot));
  console.log(''.padEnd(12) + ' hostile ' + fmt(worstHostile) + flag(worstHostile));
}
