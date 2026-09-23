/**
 * Low level drawing primitives for the indexed pixel buffer.
 *
 * Everything works on a plain Uint8Array of width*height palette indices.
 * Coordinates are floats; they are rounded at the last moment so callers can
 * pass animated values without pre-rounding.
 */

export function rect(buf, w, h, x, y, rw, rh, color) {
  if (rw <= 0 || rh <= 0) return;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(w, Math.round(x + rw));
  const y1 = Math.min(h, Math.round(y + rh));
  for (let py = y0; py < y1; py++) {
    buf.fill(color, py * w + x0, py * w + x1);
  }
}

export function circle(buf, w, h, cx, cy, r, color) {
  ellipse(buf, w, h, cx, cy, r, r, color);
}

export function ellipse(buf, w, h, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(h - 1, Math.ceil(cy + ry));
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const lim = rx2 * ry2;
  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    const row = py * w;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      if (dx * dx * ry2 + dy * dy * rx2 <= lim) buf[row + px] = color;
    }
  }
}

/** Upper half of an ellipse (used for helmets / domes). */
export function dome(buf, w, h, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(h - 1, Math.floor(cy));
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const lim = rx2 * ry2;
  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    const row = py * w;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      if (dx * dx * ry2 + dy * dy * rx2 <= lim) buf[row + px] = color;
    }
  }
}

/**
 * Thick line via DDA with a square brush. `thick` is the brush diameter in px.
 */
export function line(buf, w, h, x0, y0, x1, y1, color, thick = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const n = Math.max(1, Math.ceil(steps));
  const half = thick > 1 ? Math.floor(thick / 2) : 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = Math.round(x0 + dx * t);
    const py = Math.round(y0 + dy * t);
    if (thick <= 1) {
      if (px >= 0 && px < w && py >= 0 && py < h) buf[py * w + px] = color;
    } else {
      rect(buf, w, h, px - half, py - half, thick, thick, color);
    }
  }
}

/** Filled triangle, used for axe blades and spear heads. */
export function triangle(buf, w, h, x0, y0, x1, y1, x2, y2, color) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) return;
  const sign = area > 0 ? 1 : -1;
  for (let py = minY; py <= maxY; py++) {
    const row = py * w;
    for (let px = minX; px <= maxX; px++) {
      const d0 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) * sign;
      const d1 = ((x2 - x1) * (py - y1) - (px - x1) * (y2 - y1)) * sign;
      const d2 = ((x0 - x2) * (py - y2) - (px - x2) * (y0 - y2)) * sign;
      if (d0 >= 0 && d1 >= 0 && d2 >= 0) buf[row + px] = color;
    }
  }
}

/**
 * Filled rectangle whose top edge is sheared horizontally. Rows below the top
 * shift by `shear` pixels, which fakes a leaning body without a real rotation.
 */
export function shearRect(buf, w, h, x, y, rw, rh, shear, color) {
  for (let i = 0; i < rh; i++) {
    const t = rh <= 1 ? 0 : i / (rh - 1);
    rect(buf, w, h, x + shear * t, y + i, rw, 1, color);
  }
}

/** Axis aligned 1px outline around a rectangle. */
export function frame(buf, w, h, x, y, rw, rh, color) {
  rect(buf, w, h, x, y, rw, 1, color);
  rect(buf, w, h, x, y + rh - 1, rw, 1, color);
  rect(buf, w, h, x, y, 1, rh, color);
  rect(buf, w, h, x + rw - 1, y, 1, rh, color);
}

/**
 * Draws a sprite part through a mirroring transform: local x is measured from
 * the fighter anchor, positive towards the direction the fighter faces.
 * With face = 1 the rect grows to the right, with face = -1 to the left.
 */
export function mirrorRect(buf, w, h, cx, face, lx, y, rw, rh, color) {
  const x = face === 1 ? cx + lx : cx - lx - rw;
  rect(buf, w, h, x, y, rw, rh, color);
}

export function mirrorEllipse(buf, w, h, cx, face, lx, y, rx, ry, color) {
  ellipse(buf, w, h, cx + face * lx, y, rx, ry, color);
}

export function mirrorLine(buf, w, h, cx, face, lx0, y0, lx1, y1, color, thick = 1) {
  line(buf, w, h, cx + face * lx0, y0, cx + face * lx1, y1, color, thick);
}

/**
 * Outlines every pixel of `maskColor` that touches a different colour.
 * Used to give silhouettes a crisp dark border without a second pass buffer.
 */
export function outlinePass(buf, w, h, maskColor, outlineColor) {
  const copy = buf.slice();
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      if (copy[i] !== maskColor) continue;
      if (copy[i - 1] !== maskColor || copy[i + 1] !== maskColor
        || copy[i - w] !== maskColor || copy[i + w] !== maskColor) {
        buf[i] = outlineColor;
      }
    }
  }
}

/** Blend helper for indexed buffers: draws `color` only where target is `over`. */
export function replaceColor(buf, from, to) {
  for (let i = 0; i < buf.length; i++) if (buf[i] === from) buf[i] = to;
}
