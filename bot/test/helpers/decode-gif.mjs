/**
 * Minimal GIF decoder, used by the tests and the visual verification script to
 * check that the encoder's delta frames (transparent pixels + disposal 1) rebuild
 * the exact source frames.
 */

export function decodeGif(bytes) {
  let p = 0;
  const u8 = bytes;
  const readByte = () => u8[p++];
  const readU16 = () => { const v = u8[p] | (u8[p + 1] << 8); p += 2; return v; };

  const sig = String.fromCharCode(...u8.slice(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('bad signature: ' + sig);
  p = 6;

  const width = readU16();
  const height = readU16();
  const packed = readByte();
  readByte(); // background index
  readByte(); // aspect ratio

  let globalTable = null;
  if (packed & 0x80) {
    const size = 1 << ((packed & 0x07) + 1);
    globalTable = [];
    for (let i = 0; i < size; i++) {
      globalTable.push([u8[p], u8[p + 1], u8[p + 2]]);
      p += 3;
    }
  }

  const frames = [];
  const canvas = new Uint8Array(width * height);
  let gce = null;
  let pendingRestore = null;
  let transparentIndex = -1;

  const applyDispose = () => {
    if (pendingRestore && pendingRestore.mode === 2) {
      const { x, y, w, h } = pendingRestore;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < height && xx >= 0 && xx < width) canvas[yy * width + xx] = 0;
        }
      }
    }
    pendingRestore = null;
  };

  while (p < u8.length) {
    const block = readByte();
    if (block === 0x3b) break; // trailer

    if (block === 0x21) {
      const label = readByte();
      if (label === 0xf9) {
        const size = readByte();
        const flags = readByte();
        const delay = readU16();
        const tIndex = readByte();
        readByte(); // terminator
        if (size !== 4) throw new Error('bad GCE size');
        gce = { delay, disposal: (flags >> 2) & 7, transparent: Boolean(flags & 1) };
        transparentIndex = gce.transparent ? tIndex : -1;
      } else {
        while (true) {
          const size = readByte();
          if (!size) break;
          p += size;
        }
      }
      continue;
    }

    if (block === 0x2c) {
      const x = readU16();
      const y = readU16();
      const w = readU16();
      const h = readU16();
      const flags = readByte();
      let table = globalTable;
      if (flags & 0x80) {
        const size = 1 << ((flags & 0x07) + 1);
        table = [];
        for (let i = 0; i < size; i++) {
          table.push([u8[p], u8[p + 1], u8[p + 2]]);
          p += 3;
        }
      }
      const interlaced = Boolean(flags & 0x40);
      const minCodeSize = readByte();

      const data = [];
      while (true) {
        const size = readByte();
        if (!size) break;
        for (let i = 0; i < size; i++) data.push(u8[p + i]);
        p += size;
      }

      applyDispose();
      const indices = lzwDecode(data, minCodeSize, w * h);

      let ordered = indices;
      if (interlaced) {
        ordered = new Array(w * h);
        const passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
        let src = 0;
        for (const [start, step] of passes) {
          for (let yy = start; yy < h; yy += step) {
            for (let xx = 0; xx < w; xx++) ordered[yy * w + xx] = indices[src++];
          }
        }
      }

      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const idx = ordered[yy * w + xx];
          const cx = x + xx;
          const cy = y + yy;
          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
          if (idx === transparentIndex) continue; // keep the previous pixel
          canvas[cy * width + cx] = idx;
        }
      }

      frames.push({
        indices: canvas.slice(),
        table,
        delay: gce ? gce.delay : 0,
        disposal: gce ? gce.disposal : 0,
      });

      if (gce && gce.disposal === 2) pendingRestore = { x, y, w, h, mode: 2 };
      continue;
    }

    throw new Error('unknown block 0x' + block.toString(16) + ' at ' + p);
  }

  return { width, height, frames, globalTable };
}

function lzwDecode(data, minCodeSize, expected) {
  const out = new Array(expected);
  let outPos = 0;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = [];

  const resetDict = () => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push(null, null);
    codeSize = minCodeSize + 1;
  };
  resetDict();

  let bitPos = 0;
  const totalBits = data.length * 8;
  const readCode = () => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const bit = bitPos + i;
      if (bit >= totalBits) return -1;
      code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    }
    bitPos += codeSize;
    return code;
  };

  let prev = null;
  while (true) {
    const code = readCode();
    if (code < 0 || code === endCode) break;
    if (code === clearCode) {
      resetDict();
      prev = null;
      continue;
    }
    let entry;
    if (code < dict.length && dict[code]) {
      entry = dict[code];
    } else if (prev) {
      entry = prev.concat(prev[0]);
    } else {
      throw new Error('bad LZW code ' + code);
    }
    for (const v of entry) {
      if (outPos < expected) out[outPos++] = v;
    }
    if (prev) {
      dict.push(prev.concat(entry[0]));
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  while (outPos < expected) out[outPos++] = 0;
  return out;
}
