import { simulateBattle } from '../src/battle.js';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

const scenarios = [
  { left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'), right: mk(100, 8, 2.0, 'Петя', '#4da6ff') },
  { left: mk(200, 5, 0.8, 'Медведь', '#b0413e'), right: mk(80, 20, 3.0, 'Скороход', '#3ecfb0') },
  { left: mk(100, 10, 1.0, 'Equal A', '#ffdf3d'), right: mk(100, 10, 1.0, 'Equal B', '#9d5cff') },
];

function bench(name, fn) {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  let gifBytes = 0;
  if (result && result.bytes) {
    gifBytes = result.bytes.length;
    if (!(result.bytes[0] === 0x47 && result.bytes[1] === 0x49 && result.bytes[2] === 0x46)) {
      throw new Error('GIF magic missing');
    }
  }
  console.log(`${name.padEnd(28)} render ${result.renderMs.toFixed(1)}ms | encode ${result.encodeMs.toFixed(1)}ms | total ${(t1 - t0).toFixed(1)}ms | ${result.frames.length} frames | ${gifBytes} bytes`);
  return result;
}

for (const [i, sc] of scenarios.entries()) {
  const battle = simulateBattle(sc);
  console.log(`\n--- Scenario ${i + 1}: ${battle.winner} wins in ${battle.duration.toFixed(2)}s ---`);

  const t1 = performance.now();
  const rendered = renderBattle(sc, FREE_PROFILE);
  const t2 = performance.now();
  const gif = encodeGif(rendered.frames, rendered.width, rendered.height, rendered.palette, rendered.delayMs);
  const t3 = performance.now();

  let maxIdx = 0;
  for (const f of rendered.frames) {
    for (let k = 0; k < f.length; k++) maxIdx = Math.max(maxIdx, f[k]);
  }
  if (maxIdx >= rendered.palette.length) throw new Error(`palette overflow: ${maxIdx} >= ${rendered.palette.length}`);

  bench(`scenario ${i + 1}`, () => ({
    renderMs: t2 - t1,
    encodeMs: t3 - t2,
    bytes: gif,
    frames: rendered.frames,
  }));
}