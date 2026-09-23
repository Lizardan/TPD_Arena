import { GIFEncoder } from 'gifenc/dist/gifenc.esm.js';

/**
 * Scratch buffer for the delta pass, reused across calls.
 *
 * Encoding is the most expensive step on the Cloudflare free tier, and most of
 * the hidden cost is not the LZW work but the garbage it produces: a fresh
 * 14 KB patch buffer plus a stream buffer that doubles its way up to ~64 KB,
 * for every single request. Workers handle requests one at a time per isolate,
 * so a module-level scratch buffer is safe and removes one allocation entirely.
 */
let patchScratch = null;

/** Stream buffer big enough that the encoder does not have to grow it. */
const STREAM_CAPACITY = 64 * 1024;

/**
 * Encodes indexed frames into a looping animated GIF.
 *
 * Frames are written as deltas: the background never changes, so every pixel
 * that matches the previous frame is stored as the transparent index and the
 * decoder simply keeps the pixel it already has (`dispose: 1`). That cuts the
 * LZW payload dramatically - the arena, wall and sky are encoded once instead
 * of once per frame - and roughly halves the file.
 *
 * Note that gifenc still visits every pixel of every frame, so the delta pass
 * buys file size and LZW stream length, not a shorter pixel loop. Frame count
 * and canvas area are the real CPU levers.
 *
 * @param {Uint8Array[]} frames - indexed pixel frames (w*h each)
 * @param {number} width
 * @param {number} height
 * @param {[number,number,number][]} palette
 * @param {number} delayMs - per-frame delay in milliseconds
 * @param {{delta?: boolean}} [opts]
 * @returns {Uint8Array} GIF file bytes
 */
export function encodeGif(frames, width, height, palette, delayMs, opts = {}) {
  const useDelta = opts.delta !== false && frames.length > 1;
  const gif = GIFEncoder({ initialCapacity: STREAM_CAPACITY });

  // Reserve one extra palette slot for the "unchanged pixel" marker. The colour
  // itself is never displayed, but GIF needs a valid entry at that index.
  const transparentIndex = palette.length;
  const pal = useDelta ? [...palette, [255, 0, 255]] : palette;
  // Smallest code size that still covers the palette: shorter LZW codes mean
  // less work and a smaller file than the default 8-bit depth.
  let colorDepth = 2;
  while ((1 << colorDepth) < pal.length) colorDepth++;

  const size = width * height;
  let patch = null;
  if (useDelta) {
    if (!patchScratch || patchScratch.length < size) patchScratch = new Uint8Array(size);
    patch = patchScratch;
  }
  let prev = null;

  frames.forEach((frame, i) => {
    let data = frame;
    if (useDelta) {
      if (i === 0) {
        data = frame;
      } else {
        for (let p = 0; p < frame.length; p++) {
          patch[p] = frame[p] === prev[p] ? transparentIndex : frame[p];
        }
        data = patch;
      }
      prev = frame;
    }
    gif.writeFrame(data, width, height, {
      palette: i === 0 ? pal : undefined,
      delay: delayMs,
      repeat: i === 0 ? 0 : -1,
      transparent: useDelta && i > 0,
      transparentIndex,
      dispose: useDelta ? 1 : -1,
      colorDepth,
    });
  });

  gif.finish();
  // bytesView() is a subarray of the internal stream - correct length, no copy.
  return gif.bytesView();
}

export { renderBattle, FREE_PROFILE } from './renderer.js';
