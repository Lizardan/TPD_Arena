import { renderBattle } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });
const scenarios = [
  { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  { left: mk(200, 5, 0.8, 'Медведь', '#b0413e'), right: mk(80, 20, 3.0, 'Скороход', '#3ecfb0') },
  { left: mk(100, 10, 1.0, 'Equal A', '#ffdf3d'), right: mk(100, 10, 1.0, 'Equal B', '#9d5cff') },
  { left: mk(50, 30, 5.0, 'FastA', '#ff6b6b'), right: mk(60, 25, 4.0, 'FastB', '#4ecdc4') },
];

const profiles = [
  { name: '128x96/8fps', width: 128, height: 96, fps: 8, maxFrames: 20, maxDuration: 2.5, holdAfter: 0.4, floorHeight: 14 },
  { name: '112x84/8fps', width: 112, height: 84, fps: 8, maxFrames: 20, maxDuration: 2.5, holdAfter: 0.4, floorHeight: 14 },
  { name: '128x96/10fps16', width: 128, height: 96, fps: 10, maxFrames: 16, maxDuration: 1.6, holdAfter: 0.3, floorHeight: 14 },
];

for (const prof of profiles) {
  // Warm up JIT.
  const warm = renderBattle(scenarios[0], prof);
  encodeGif(warm.frames, warm.width, warm.height, warm.palette, warm.delayMs);

  // Measure 5 iterations each, take min (best warm case) and report all maxes.
  let maxRen = 0, maxEnc = 0, maxTotal = 0, maxFrames = 0;
  for (let it = 0; it < 5; it++) {
    for (const sc of scenarios) {
      const t1 = performance.now();
      const r = renderBattle(sc, prof);
      const t2 = performance.now();
      const g = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
      const t3 = performance.now();
      maxRen = Math.max(maxRen, t2 - t1);
      maxEnc = Math.max(maxEnc, t3 - t2);
      maxTotal = Math.max(maxTotal, t3 - t1);
      maxFrames = Math.max(maxFrames, r.frames.length);
      if (g.length === 0) throw new Error('empty gif');
    }
  }
  console.log(
    `${prof.name.padEnd(16)} frames(max ${maxFrames}) render ${maxRen.toFixed(2)}ms encode ${maxEnc.toFixed(2)}ms total ${maxTotal.toFixed(2)}ms`
  );
}