import { describe, it, expect } from 'vitest';
import { renderBattle, FREE_PROFILE, computeNameplateLayout } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { decodeGif } from './helpers/decode-gif.mjs';
import { simulateBattle } from '../src/battle.js';
import { computeFighterState } from '../src/fighter.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });
const simple = () => ({
  left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'),
  right: mk(100, 8, 2.0, 'Петя', '#4da6ff'),
});

/** Walks the warped timeline and returns the mode of each fighter per frame. */
function frameModes(request) {
  const r = renderBattle(request);
  const battle = simulateBattle(request);
  // Use the renderer's own mapping rather than a copy, so the test walks
  // exactly the timeline that produced the frames.
  const simAt = r.timeline.simAt;
  const out = [];
  for (let g = 0; g < r.framesCount; g++) {
    const simT = simAt(g / FREE_PROFILE.fps);
    out.push({
      left: computeFighterState(battle, 'left', simT).mode,
      right: computeFighterState(battle, 'right', simT).mode,
    });
  }
  return out;
}

describe('renderBattle', () => {
  it('produces indexed frames within palette bounds', () => {
    const r = renderBattle(simple());
    expect(r.frames.length).toBeGreaterThanOrEqual(2);
    let maxIdx = -1;
    for (const frame of r.frames) {
      expect(frame.length).toBe(r.width * r.height);
      for (let i = 0; i < frame.length; i++) {
        if (frame[i] > maxIdx) maxIdx = frame[i];
      }
    }
    expect(maxIdx).toBeGreaterThanOrEqual(0);
    expect(maxIdx).toBeLessThan(r.palette.length);
    expect(r.palette.length).toBeLessThanOrEqual(256);
  });

  it('respects maxFrames', () => {
    const longBattle = { left: mk(500, 1, 1, 'A'), right: mk(500, 1, 1, 'B') };
    const r = renderBattle(longBattle, FREE_PROFILE);
    expect(r.frames.length).toBeLessThanOrEqual(FREE_PROFILE.maxFrames);
  });

  it('respects default color when omitted', () => {
    const r = renderBattle({ left: mk(100, 10, 1, 'A'), right: mk(100, 10, 1, 'B') });
    expect(r.palette.length).toBeGreaterThan(14);
  });

  it('uses requested colors', () => {
    const r = renderBattle({ left: mk(100, 10, 1, 'A', '#ff0000'), right: mk(100, 10, 1, 'B', '#00ff00') });
    expect(r.palette).toContainEqual([255, 0, 0]);
    expect(r.palette).toContainEqual([0, 255, 0]);
  });
});

describe('animation timeline', () => {
  it('runs fast enough to not look like a slideshow', () => {
    // The original profile ran at 8 fps; anything below 12 still reads as jerky.
    expect(FREE_PROFILE.fps).toBeGreaterThanOrEqual(12);
    expect(FREE_PROFILE.framesCount).toBeUndefined();
    expect(1000 / FREE_PROFILE.fps).toBeLessThanOrEqual(85);
  });

  it('gives a swing several frames on screen', () => {
    // A 0.35 s attack used to land on a single frame because the whole battle
    // was squeezed into 20 frames. At 12 fps a swing must span at least 4.
    const r = renderBattle(simple());
    const attackSegs = r.timeline.segments.filter((s) => s.kind === 'action');
    expect(attackSegs.length).toBeGreaterThan(0);
    for (const seg of attackSegs) {
      const frames = (seg.gifT1 - seg.gifT0) * FREE_PROFILE.fps;
      expect(frames).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps idle gaps so fighters visibly wait between attacks', () => {
    const r = renderBattle(simple());
    const idleSegs = r.timeline.segments.filter((s) => s.kind === 'idle' && s.gifT1 > s.gifT0);
    expect(idleSegs.length).toBeGreaterThan(0);
    for (const seg of idleSegs) {
      const frames = (seg.gifT1 - seg.gifT0) * FREE_PROFILE.fps;
      // Allow for float rounding (2 frames computes as 1.9999999999999996).
      expect(frames).toBeGreaterThan(1.9);
    }
  });

  it('alternates idle and attack for both fighters', () => {
    const modes = frameModes(simple());
    expect(modes.some((m) => m.left === 'idle' && m.right === 'idle')).toBe(true);
    expect(modes.some((m) => m.left === 'attack')).toBe(true);
    expect(modes.some((m) => m.right === 'attack')).toBe(true);
  });

  it('ends with the loser dead and the winner idle', () => {
    const modes = frameModes(simple());
    const last = modes[modes.length - 1];
    expect([last.left, last.right]).toContain('dead');
    expect([last.left, last.right]).toContain('idle');
  });

  it('never shrinks attack windows below the readable floor', () => {
    const r = renderBattle(simple());
    expect(r.timeline.attackScale).toBeGreaterThanOrEqual(0.4);
  });
});

describe('highlight-reel timeline', () => {
  // A grind: 180 HP traded 6 damage at a time is ~60 swings over ~50 s of sim
  // time. Compressing every swing into 48 frames used to shrink each one to
  // under two frames, which is exactly the stutter this timeline exists to fix.
  const grind = () => ({ left: mk(180, 6, 0.6, 'Танк'), right: mk(180, 6, 0.6, 'Стена') });
  const frantic = () => ({ left: mk(999, 1, 10, 'A'), right: mk(999, 1, 10, 'B') });

  it('never squeezes a swing below the readable floor, however long the fight', () => {
    for (const req of [simple(), grind(), frantic()]) {
      const r = renderBattle(req);
      expect(r.frames.length).toBeLessThanOrEqual(FREE_PROFILE.maxFrames);
      const actions = r.timeline.segments.filter((s) => s.kind === 'action');
      expect(actions.length).toBeGreaterThan(0);
      for (const seg of actions) {
        expect((seg.gifT1 - seg.gifT0) * FREE_PROFILE.fps).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('plays attacks at full length instead of compressing them', () => {
    // attackScale < 1 means the old uniform squeeze came back.
    for (const req of [simple(), grind()]) {
      expect(renderBattle(req).timeline.attackScale).toBe(1);
    }
  });

  it('samples a spread of exchanges instead of only the opening', () => {
    const r = renderBattle(grind());
    expect(r.timeline.totalBeats).toBeGreaterThan(6);
    expect(r.timeline.beats).toBeGreaterThanOrEqual(3);
    expect(r.timeline.beats).toBeLessThan(r.timeline.totalBeats);
  });

  it('always puts the killing blow on screen', () => {
    for (const req of [simple(), grind()]) {
      const r = renderBattle(req);
      const death = simulateBattle(req).events.find((e) => e.type === 'death');
      expect(death).toBeDefined();
      const actions = r.timeline.segments.filter((s) => s.kind === 'action');
      const last = actions[actions.length - 1];
      expect(last.simT0).toBeLessThanOrEqual(death.t);
      expect(last.simT1).toBeGreaterThanOrEqual(death.t);
    }
  });

  it('still renders a fight that times out with nobody dead', () => {
    // 999 HP at 1 damage cannot be chewed through in the 60 s sim limit, so
    // there is no death event at all - the clip must not fall over.
    const r = renderBattle(frantic());
    expect(r.frames.length).toBeGreaterThanOrEqual(2);
    expect(r.frames.length).toBeLessThanOrEqual(FREE_PROFILE.maxFrames);
    expect(r.timeline.segments.some((s) => s.kind === 'hold')).toBe(true);
  });

  it('leaves a visible idle pause between exchanges', () => {
    const r = renderBattle(grind());
    const gaps = r.timeline.segments.filter((s) => s.kind === 'idle' && s.gifT1 > s.gifT0);
    expect(gaps.length).toBeGreaterThan(0);
    for (const seg of gaps) {
      expect((seg.gifT1 - seg.gifT0) * FREE_PROFILE.fps).toBeGreaterThan(1.9);
    }
  });
});

describe('encodeGif', () => {
  it('returns a valid GIF89a with loop extension', () => {
    const r = renderBattle(simple());
    const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    expect(gif[0]).toBe(0x47); // G
    expect(gif[1]).toBe(0x49); // I
    expect(gif[2]).toBe(0x46); // F
    expect(gif[3]).toBe(0x38); // 8
    expect(gif[4]).toBe(0x39); // 9
    expect(gif[5]).toBe(0x61); // a
    expect(gif[gif.length - 1]).toBe(0x3b); // trailer
    expect(gif.length).toBeGreaterThan(1000);
  });

  it('embeds NETSCAPE2.0 loop extension', () => {
    const r = renderBattle(simple());
    const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const ascii = Buffer.from(gif).toString('latin1');
    expect(ascii.includes('NETSCAPE2.0')).toBe(true);
  });

  it('produces a file small enough for a chat attachment', () => {
    const r = renderBattle(simple());
    const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    expect(gif.length).toBeLessThan(150_000);
  });

  it('round-trips delta frames without corruption', () => {
    // Unchanged pixels are stored as transparent; decoding must rebuild the
    // exact source frames or Telegram would show torn sprites.
    const r = renderBattle(simple());
    const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const decoded = decodeGif(gif);
    expect(decoded.frames.length).toBe(r.frames.length);
    expect(decoded.width).toBe(r.width);
    expect(decoded.height).toBe(r.height);
    for (let i = 0; i < r.frames.length; i++) {
      expect(Array.from(decoded.frames[i].indices)).toEqual(Array.from(r.frames[i]));
    }
  });

  it('is much smaller with delta frames than without', () => {
    const r = renderBattle(simple());
    const delta = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const full = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs, { delta: false });
    expect(delta.length).toBeLessThan(full.length * 0.8);
  });
});

describe('name plates', () => {
  it('fits long nicknames inside the canvas', () => {
    const w = FREE_PROFILE.width;
    const cxL = Math.round(w * 0.30);
    const cxR = Math.round(w * 0.70);
    const half = cxR - cxL;
    const left = computeNameplateLayout('Очень_Длинный_Никнейм', cxL, half, w, true);
    const right = computeNameplateLayout('Второй_Длинный_Ник', cxR, half, w, false);
    expect(left.plateX).toBeGreaterThanOrEqual(0);
    expect(right.plateX + right.plateW).toBeLessThanOrEqual(w);
  });

  it('never lets the two plates overlap', () => {
    const w = FREE_PROFILE.width;
    const cxL = Math.round(w * 0.30);
    const cxR = Math.round(w * 0.70);
    const half = cxR - cxL;
    const cases = [
      ['Иван', 'Петя'],
      ['Очень_Длинный_Никнейм', 'Второй_Длинный_Ник'],
      ['Очень_Длинный_Никнейм', 'К'],
      ['АААААААААААААААААААААААА', 'ББББББББББББББББББББББББ'],
    ];
    for (const [l, r] of cases) {
      const left = computeNameplateLayout(l, cxL, half, w, true);
      const right = computeNameplateLayout(r, cxR, half, w, false);
      expect(left.plateX + left.plateW).toBeLessThanOrEqual(right.plateX);
    }
  });

  it('keeps a long nickname on two lines instead of truncating it', () => {
    const w = FREE_PROFILE.width;
    const cxL = Math.round(w * 0.30);
    const layout = computeNameplateLayout('Очень_Длинный_Ник', cxL, 54, w, true);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join('').length).toBe('ОЧЕНЬ_ДЛИННЫЙ_НИК'.length);
  });

  it('prefers one line over wrapping when the name fits', () => {
    const w = FREE_PROFILE.width;
    const cxL = Math.round(w * 0.30);
    // "Медведь" used to be split into "МЕДВЕ" / "ДЬ" because the large scale
    // was always tried first. It must stay on a single line.
    const layout = computeNameplateLayout('Медведь', cxL, 54, w, true);
    expect(layout.lines).toEqual(['МЕДВЕДЬ']);
  });
});
