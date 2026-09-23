export const GLYPH_W = 3;
export const GLYPH_H = 5;
const ADVANCE = GLYPH_W + 1;

// Each glyph: 5 rows, 3 bits per row (bit 2 = left pixel, bit 0 = right pixel).
const G = {
  ' ': [0, 0, 0, 0, 0],
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
  'A': [2, 5, 7, 5, 5],
  'B': [6, 5, 6, 5, 6],
  'C': [7, 4, 4, 4, 7],
  'D': [6, 5, 5, 5, 6],
  'E': [7, 4, 7, 4, 7],
  'F': [7, 4, 7, 4, 4],
  'G': [7, 4, 5, 5, 7],
  'H': [5, 5, 7, 5, 5],
  'I': [7, 2, 2, 2, 7],
  'J': [1, 1, 1, 5, 2],
  'K': [5, 5, 6, 5, 5],
  'L': [4, 4, 4, 4, 7],
  'M': [5, 7, 7, 5, 5],
  'N': [5, 7, 7, 7, 5],
  'O': [7, 5, 5, 5, 7],
  'P': [7, 5, 7, 4, 4],
  'Q': [7, 5, 5, 7, 1],
  'R': [7, 5, 7, 6, 5],
  'S': [7, 4, 7, 1, 7],
  'T': [7, 2, 2, 2, 2],
  'U': [5, 5, 5, 5, 7],
  'V': [5, 5, 5, 5, 2],
  'W': [5, 5, 7, 7, 5],
  'X': [5, 5, 2, 5, 5],
  'Y': [5, 5, 2, 2, 2],
  'Z': [7, 1, 2, 4, 7],
  '-': [0, 0, 7, 0, 0],
  '+': [0, 2, 7, 2, 0],
  '@': [7, 5, 7, 4, 7],
  '.': [0, 0, 0, 0, 2],
  '!': [2, 2, 2, 0, 2],
  '?': [7, 1, 7, 0, 2],
  ':': [0, 2, 0, 2, 0],
  '_': [0, 0, 0, 0, 7],
  // Cyrillic
  'А': [2, 5, 7, 5, 5],
  'Б': [7, 4, 7, 5, 7],
  'В': [6, 5, 6, 5, 6],
  'Г': [7, 4, 4, 4, 4],
  'Д': [3, 3, 3, 5, 7],
  'Е': [7, 4, 7, 4, 7],
  'Ж': [5, 5, 7, 5, 5],
  'З': [7, 1, 7, 1, 7],
  'И': [5, 7, 7, 5, 5],
  'Й': [2, 0, 5, 7, 5],
  'К': [5, 5, 6, 5, 5],
  'Л': [3, 5, 5, 5, 5],
  'М': [5, 7, 7, 5, 5],
  'Н': [5, 5, 7, 5, 5],
  'О': [7, 5, 5, 5, 7],
  'П': [7, 5, 5, 5, 5],
  'Р': [7, 5, 7, 4, 4],
  'С': [7, 4, 4, 4, 7],
  'Т': [7, 2, 2, 2, 2],
  'У': [5, 5, 7, 1, 7],
  'Ф': [2, 7, 2, 7, 2],
  'Х': [5, 5, 2, 5, 5],
  'Ц': [5, 5, 5, 5, 7],
  'Ч': [5, 5, 7, 1, 1],
  'Ш': [5, 5, 5, 5, 7],
  'Щ': [7, 5, 5, 5, 7],
  'Ъ': [6, 4, 6, 4, 6],
  'Ы': [5, 5, 5, 7, 4],
  'Ь': [4, 4, 4, 4, 6],
  'Э': [7, 1, 7, 5, 7],
  'Ю': [5, 7, 7, 5, 5],
  'Я': [7, 1, 7, 5, 5],
  'Ё': [5, 0, 7, 4, 7],
};

export function measureText(str) {
  const n = str.length;
  return n === 0 ? 0 : n * ADVANCE - 1;
}

/**
 * Draws uppercase text into an indexed pixel buffer. Returns advance width.
 */
export function drawText(buf, width, height, str, x, y, color, scale = 1) {
  let cx = x;
  const upper = String(str).toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const glyph = G[upper[i]] || G['?'];
    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row];
      for (let col = 0; col < GLYPH_W; col++) {
        if ((bits >> (GLYPH_W - 1 - col)) & 1) {
          fillCell(buf, width, height, cx + col * scale, y + row * scale, scale, color);
        }
      }
    }
    cx += ADVANCE * scale;
  }
  return cx - x - (ADVANCE - GLYPH_W) * scale;
}

function fillCell(buf, width, height, x, y, scale, color) {
  for (let dy = 0; dy < scale; dy++) {
    const py = y + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = 0; dx < scale; dx++) {
      const px = x + dx;
      if (px < 0 || px >= width) continue;
      buf[py * width + px] = color;
    }
  }
}

export function drawTextCentered(buf, width, height, str, cx, y, color, scale = 1) {
  const w = measureText(str) * scale;
  return drawText(buf, width, height, str, Math.round(cx - w / 2), y, color, scale);
}
