import { GIFEncoder } from 'gifenc/dist/gifenc.esm.js';

/**
 * Encodes indexed frames into a looping animated GIF.
 * @param {Uint8Array[]} frames - indexed pixel frames (w*h each)
 * @param {number} width
 * @param {number} height
 * @param {[number,number,number][]} palette
 * @param {number} delayMs - per-frame delay in milliseconds
 * @returns {Uint8Array} GIF file bytes
 */
export function encodeGif(frames, width, height, palette, delayMs) {
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    gif.writeFrame(frame, width, height, {
      palette: i === 0 ? palette : undefined,
      delay: delayMs,
      repeat: 0,
    });
  });
  gif.finish();
  return gif.bytes();
}

export { renderBattle, FREE_PROFILE } from './renderer.js';