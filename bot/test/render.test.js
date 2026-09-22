import { describe, it, expect } from 'vitest';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });
const simple = () => ({
  left: mk(100, 12, 1.0, 'Иван', '#ff9b3d'),
  right: mk(100, 8, 2.0, 'Петя', '#4da6ff'),
});

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

  it('produces a reasonably small file', () => {
    const r = renderBattle(simple());
    const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    expect(gif.length).toBeLessThan(60_000);
  });
});