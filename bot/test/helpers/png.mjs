/**
 * Minimal PNG writer for the verification scripts.
 *
 * Node 22 has no canvas and no image encoder, and the renderer works on an
 * indexed palette, so the inspection sheets are assembled by hand: RGBA buffer
 * in, deflate, CRC32, done.
 */
import * as zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** @param {Buffer} rgba - width*height*4 bytes */
export function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Lays indexed frames out in a grid, scaled up by `zoom`, with a dark gutter
 * and a label row per cell (1px tick marks in the fighter colours are enough
 * to see at a glance which beat a frame belongs to).
 */
export function contactSheet({ frames, width, height, palette, picks, zoom = 3, cols = 4, gap = 3, bg = [32, 32, 40] }) {
  const rows = Math.ceil(picks.length / cols);
  const zw = width * zoom;
  const zh = height * zoom;
  const sheetW = cols * zw + (cols + 1) * gap;
  const sheetH = rows * zh + (rows + 1) * gap;
  const sheet = Buffer.alloc(sheetW * sheetH * 4, 255);
  for (let i = 0; i < sheetW * sheetH; i++) {
    sheet[i * 4] = bg[0];
    sheet[i * 4 + 1] = bg[1];
    sheet[i * 4 + 2] = bg[2];
  }

  picks.forEach((fi, n) => {
    const frame = frames[fi];
    if (!frame) return;
    const ox = gap + (n % cols) * (zw + gap);
    const oy = gap + Math.floor(n / cols) * (zh + gap);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = palette[frame[y * width + x]] || [255, 0, 255];
        for (let dy = 0; dy < zoom; dy++) {
          for (let dx = 0; dx < zoom; dx++) {
            const p = ((oy + y * zoom + dy) * sheetW + ox + x * zoom + dx) * 4;
            sheet[p] = c[0];
            sheet[p + 1] = c[1];
            sheet[p + 2] = c[2];
            sheet[p + 3] = 255;
          }
        }
      }
    }
  });

  return { sheet, sheetW, sheetH };
}
