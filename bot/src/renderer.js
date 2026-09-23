/**
 * Battle scene renderer: builds the indexed GIF frames for one battle.
 *
 * Per frame: background blit (with screen shake) -> fighters -> impact FX ->
 * HUD. The background is rasterised once and blitted into every frame, so the
 * per-frame cost is dominated by the two fighters.
 */

import { simulateBattle } from './battle.js';
import { drawTextCentered, measureText } from './font.js';
import { C, buildPalette, hexToRgb } from './palette.js';
import { rect, ellipse, circle, line, triangle, dome } from './draw.js';
import { computeFighterState, drawFighter, pickWeapon, impactsNear, FIG } from './fighter.js';
import { buildTimeline } from './timeline.js';

/**
 * Rendering profile tuned for the Cloudflare Workers free tier (~10 ms CPU per
 * request). 136x102 at 12 fps with up to 36 frames.
 *
 * Two things matter for the "jerky / low FPS" look the original profile had:
 *
 *   - frame rate and how many frames a swing gets. The original ran 128x96 at
 *     8 fps with 20 frames, so a 0.35 s attack landed on a single frame. Here a
 *     swing spans 5-6 frames.
 *   - how the battle is fitted into the budget. Compressing every exchange made
 *     long fights collapse again; the timeline now shows a spread of exchanges
 *     at full length instead (see timeline.js).
 *
 * Frame count is the dominant CPU lever, because gifenc visits every pixel of
 * every frame whether or not it changed. 36 frames keeps the worst case of the
 * bot's own stat ranges near 8 ms, leaving room for the webhook work around it.
 * Raising maxFrames buys one more exchange per ~9 frames and costs ~1 ms each.
 */
export const FREE_PROFILE = {
  width: 136,
  height: 102,
  fps: 12,
  maxFrames: 36,
  holdAfter: 0.3,
  floorHeight: 17,
  shakeDur: 0.18,
};

export { hexToRgb };

const NAME_SCALE_MAX = 2;
const NAME_MAX_LINES = 2;

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

/** Deterministic star field, rasterised once. */
const STARS = [
  [0.06, 0.12], [0.14, 0.28], [0.21, 0.08], [0.29, 0.2], [0.36, 0.05],
  [0.44, 0.24], [0.51, 0.1], [0.58, 0.3], [0.66, 0.14], [0.73, 0.06],
  [0.8, 0.26], [0.87, 0.11], [0.93, 0.22], [0.97, 0.07], [0.11, 0.36],
  [0.4, 0.34], [0.62, 0.38], [0.83, 0.35],
];

function renderBackground(w, h, floorY, horizon) {
  const buf = new Uint8Array(w * h);

  /* --- Night sky --- */
  const bands = [C.sky0, C.sky1, C.sky2, C.sky3];
  for (let i = 0; i < bands.length; i++) {
    const y0 = Math.floor((horizon * i) / bands.length);
    const y1 = Math.floor((horizon * (i + 1)) / bands.length);
    buf.fill(bands[i], y0 * w, y1 * w);
  }
  for (const [sx, sy] of STARS) {
    const px = Math.round(sx * w);
    const py = Math.round(sy * horizon);
    buf[py * w + px] = C.white;
  }
  // Moon with a soft halo.
  const mx = Math.round(w * 0.82);
  const my = Math.round(horizon * 0.24);
  circle(buf, w, h, mx, my, 9, C.sky3);
  circle(buf, w, h, mx, my, 7, C.hpGhost);
  circle(buf, w, h, mx - 2, my - 2, 2, C.sky2);
  circle(buf, w, h, mx + 3, my + 2, 1.5, C.sky2);

  /* --- Arena wall --- */
  const wallTop = horizon;
  rect(buf, w, h, 0, wallTop, w, floorY - wallTop, C.wall);
  // Stone courses.
  for (let y = wallTop + 6; y < floorY; y += 7) {
    rect(buf, w, h, 0, y, w, 1, C.wallLight);
  }
  // Vertical joints, offset per course so it reads as masonry.
  for (let y = wallTop + 6, row = 0; y < floorY; y += 7, row++) {
    const off = row % 2 === 0 ? 0 : 9;
    for (let x = off; x < w; x += 18) {
      rect(buf, w, h, x, y, 1, Math.min(7, floorY - y), C.wallLight);
    }
  }
  // Parapet with merlons.
  rect(buf, w, h, 0, wallTop - 4, w, 4, C.wallLight);
  for (let x = 2; x < w; x += 12) {
    rect(buf, w, h, x, wallTop - 8, 7, 5, C.wallLight);
    rect(buf, w, h, x, wallTop - 8, 7, 1, C.sky3);
  }
  // Arched gateways at the sides, lit faintly from the torches inside.
  for (const ax of [0.13, 0.87]) {
    const gx = Math.round(ax * w);
    const gw = 17;
    const gh = 20;
    rect(buf, w, h, gx - gw / 2, floorY - gh, gw, gh, C.outline);
    dome(buf, w, h, gx, floorY - gh, gw / 2, gw / 2 + 2, C.outline);
    rect(buf, w, h, gx - gw / 2 + 2, floorY - gh + 3, gw - 4, gh - 3, C.sky0);
    dome(buf, w, h, gx, floorY - gh + 2, gw / 2 - 2, gw / 2 - 1, C.sky0);
    rect(buf, w, h, gx - gw / 2 + 2, floorY - gh + 3, gw - 4, 4, C.sky1);
    dome(buf, w, h, gx, floorY - gh + 2, gw / 2 - 2, gw / 2 - 1, C.sky1);
  }
  // Narrow arrow slits along the wall.
  for (const sx of [0.3, 0.42, 0.58, 0.7]) {
    const gx = Math.round(sx * w);
    rect(buf, w, h, gx - 1, wallTop + 12, 3, 9, C.outline);
    rect(buf, w, h, gx, wallTop + 13, 1, 7, C.sky1);
  }
  // Torches on the wall.
  for (const tx of [0.11, 0.39, 0.61, 0.89]) {
    const gx = Math.round(tx * w);
    const gy = wallTop + 10;
    rect(buf, w, h, gx, gy, 2, 7, C.woodShade);
    rect(buf, w, h, gx - 2, gy + 7, 6, 2, C.metalShade);
    circle(buf, w, h, gx + 1, gy - 2, 3, C.damage);
    circle(buf, w, h, gx + 1, gy - 3, 1.6, C.spark);
  }

  /* --- Sand floor --- */
  rect(buf, w, h, 0, floorY, w, h - floorY, C.floor0);
  rect(buf, w, h, 0, floorY, w, 2, C.floorLine);
  rect(buf, w, h, 0, floorY + 2, w, 1, C.floor1);
  for (let i = 0; i < 60; i++) {
    const gx = (i * 37 + 11) % w;
    const gy = floorY + 3 + ((i * 53) % Math.max(1, h - floorY - 4));
    buf[gy * w + gx] = C.floor1;
  }
  // A few flat stones for scale.
  for (const [sx, sy, sw] of [[0.28, 0.55, 9], [0.68, 0.72, 12], [0.48, 0.35, 7]]) {
    const gx = Math.round(sx * w);
    const gy = floorY + Math.round(sy * (h - floorY));
    rect(buf, w, h, gx, gy, sw, 2, C.floor1);
    rect(buf, w, h, gx, gy, sw, 1, C.floorLine);
  }

  return buf;
}

/** Copies the background into a frame with a pixel offset (screen shake). */
function blit(buf, bg, w, h, dx, dy) {
  if (dx === 0 && dy === 0) {
    buf.set(bg);
    return;
  }
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    const src = bg.subarray(sy * w, sy * w + w);
    const dstStart = y * w;
    if (dx === 0) {
      buf.set(src, dstStart);
    } else if (dx > 0) {
      buf.set(src.subarray(0, w - dx), dstStart + dx);
      buf.fill(C.outline, dstStart, dstStart + dx);
    } else {
      buf.set(src.subarray(-dx), dstStart);
      buf.fill(C.outline, dstStart + w + dx, dstStart + w);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

const SPARK_DIRS = [
  [1, 0], [0.5, -0.87], [-0.5, -0.87], [-1, 0], [-0.5, 0.87], [0.5, 0.87],
  [0.87, -0.5], [-0.87, 0.5],
];

function drawSparks(buf, w, h, cx, cy, progress) {
  const r = 2 + progress * 10;
  const alpha = 1 - progress;
  for (let i = 0; i < SPARK_DIRS.length; i++) {
    const [ux, uy] = SPARK_DIRS[i];
    const px = Math.round(cx + ux * r);
    const py = Math.round(cy + uy * r * 0.85);
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    buf[py * w + px] = alpha > 0.45 ? C.spark : C.damage;
    if (alpha > 0.6 && i % 2 === 0) {
      const tx = Math.round(cx + ux * (r - 3));
      const ty = Math.round(cy + uy * (r - 3) * 0.85);
      if (tx >= 0 && tx < w && ty >= 0 && ty < h) buf[ty * w + tx] = C.damage;
    }
  }
  if (progress < 0.35) {
    circle(buf, w, h, cx, cy, 2.8 * (1 - progress / 0.35), C.white);
  }
}

function drawDust(buf, w, h, cx, floorY, progress) {
  if (progress < 0 || progress > 1) return;
  const spread = 3 + progress * 8;
  const fade = 1 - progress;
  for (let i = 0; i < 6; i++) {
    const ux = (i / 5) * 2 - 1;
    const px = Math.round(cx + ux * spread);
    const py = Math.round(floorY - 1 - progress * 4 + (i % 2));
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    buf[py * w + px] = fade > 0.4 ? C.dust : C.floorLine;
  }
}

/** Text with a 1px dark outline so numbers stay readable on any background. */
function drawTextOutlined(buf, w, h, str, cx, y, color, scale = 1) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    drawTextCentered(buf, w, h, str, cx + ox, y + oy, C.outline, scale);
  }
  drawTextCentered(buf, w, h, str, cx, y, color, scale);
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function wrapLabel(label, perLine, maxLines) {
  if (perLine < 1) return null;
  if (label.length <= perLine) return [label];
  const lines = [];
  let rest = label;
  while (rest.length > 0) {
    if (lines.length === maxLines) return null;
    if (rest.length <= perLine) {
      lines.push(rest);
      break;
    }
    // Prefer breaking on a separator so nicknames stay readable.
    let cut = -1;
    for (let i = Math.min(perLine, rest.length - 1); i > Math.max(0, perLine - 5); i--) {
      const ch = rest[i];
      if (ch === ' ' || ch === '_' || ch === '-' || ch === '.') { cut = i + 1; break; }
    }
    if (cut <= 0) cut = perLine;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return lines;
}

/**
 * Fits a nickname into `maxW`.
 *
 * Preference order matters: a single line is always nicer than a wrap, so the
 * large scale is only used when the name fits on one line; otherwise the small
 * scale gets a chance before wrapping. Long Telegram nicknames therefore end up
 * on two lines rather than running off the canvas or being chopped mid-word.
 */
function layoutName(name, maxW) {
  const label = String(name || '???').toUpperCase();
  const attempts = [
    [NAME_SCALE_MAX, 1],
    [1, 1],
    [NAME_SCALE_MAX, NAME_MAX_LINES],
    [1, NAME_MAX_LINES],
  ];
  for (const [scale, maxLines] of attempts) {
    const perLine = Math.floor((maxW + 1) / (4 * scale));
    const lines = wrapLabel(label, perLine, maxLines);
    if (lines) return { lines, scale };
  }
  // Nothing fits even at the smallest scale: truncate to the available space.
  const perLine = Math.floor((maxW + 1) / 4);
  const lines = wrapLabel(label.slice(0, perLine * NAME_MAX_LINES), perLine, NAME_MAX_LINES);
  return { lines: lines || [label.slice(0, perLine)], scale: 1 };
}

/**
 * Computes the name plate geometry without drawing it.
 *
 * The plate is centred over its own fighter but clamped into its half of the
 * canvas, so two long nicknames can never overlap. Exported so the layout rules
 * are directly testable.
 */
export function computeNameplateLayout(name, cx, halfSide, w, isLeft) {
  const maxW = Math.max(20, Math.round(Math.abs(halfSide) - 12));
  const { lines, scale } = layoutName(name, maxW);
  const lineH = 5 * scale;
  const lineGap = scale;
  const blockH = lines.length * lineH + (lines.length - 1) * lineGap;
  const widest = Math.max(...lines.map((l) => measureText(l) * scale));
  const plateW = Math.min(w - 6, widest + 6);

  const minCx = isLeft ? plateW / 2 + 2 : w / 2 + plateW / 2 + 2;
  const maxCx = isLeft ? w / 2 - plateW / 2 - 2 : w - plateW / 2 - 2;
  const plateCx = Math.max(minCx, Math.min(maxCx, cx));
  const plateX = Math.round(plateCx - plateW / 2);

  return { lines, scale, blockH, plateW, plateCx, plateX, maxW };
}

/**
 * Name plate above the fighter. Uses the layout above and draws a dark plate
 * with an accent stripe in the fighter's colour.
 */
function drawNameplate(buf, w, h, cx, halfSide, st, accent) {
  const isLeft = accent.side === 'left';
  const layout = computeNameplateLayout(st.name, cx, halfSide, w, isLeft);
  const { lines, scale, blockH, plateW, plateCx, plateX } = layout;

  const lineH = 5 * scale;
  const lineGap = scale;
  const headTop = st.floorY - FIG.legH - FIG.bodyH - FIG.neckH - FIG.headR * 2;
  const barY = headTop - 12;
  const nameBottom = barY - 4;
  const plateTop = Math.round(nameBottom - blockH - 3);

  rect(buf, w, h, plateX - 1, plateTop - 1, plateW + 2, blockH + 6, C.outline);
  rect(buf, w, h, plateX, plateTop, plateW, blockH + 4, C.hpBg);
  // Accent stripe in the fighter's colour ties the plate to its owner.
  rect(buf, w, h, plateX, plateTop, plateW, 1, accent.color);

  lines.forEach((line, i) => {
    const y = nameBottom - (lines.length - i) * lineH - (lines.length - 1 - i) * lineGap;
    drawTextCentered(buf, w, h, line, plateCx, y, C.white, scale);
  });

  return { barY };
}

function drawHealthBar(buf, w, h, cx, barY, st, accent) {
  const barW = 42;
  const barH = 5;
  const bx = Math.round(cx - barW / 2);
  const frac = st.maxHp > 0 ? Math.max(0, Math.min(1, st.hp / st.maxHp)) : 0;
  const ghostFrac = st.maxHp > 0 ? Math.max(0, Math.min(1, st.ghostHp / st.maxHp)) : 0;

  rect(buf, w, h, bx - 1, barY - 1, barW + 2, barH + 2, C.hpFrame);
  rect(buf, w, h, bx, barY, barW, barH, C.hpBg);

  const ghostW = Math.round(barW * ghostFrac);
  if (ghostW > 0) rect(buf, w, h, bx, barY, ghostW, barH, C.hpGhost);

  const fillW = Math.round(barW * frac);
  if (fillW > 0) {
    const color = frac > 0.5 ? C.hpGreen : frac > 0.25 ? C.hpYellow : C.hpRed;
    rect(buf, w, h, bx, barY, fillW, barH, color);
    // Subtle top highlight and bottom shade for a bit of depth.
    rect(buf, w, h, bx, barY, fillW, 1, frac > 0.5 ? C.hpYellow : C.hpRed);
    rect(buf, w, h, bx, barY + barH - 1, fillW, 1, C.hpFrame);
  }

  for (let i = 1; i < 4; i++) {
    rect(buf, w, h, bx + Math.round((barW * i) / 4), barY, 1, barH, C.hpFrame);
  }
  // End caps in the owner's colour.
  rect(buf, w, h, bx - 1, barY - 1, 1, barH + 2, accent.color);
  rect(buf, w, h, bx + barW, barY - 1, 1, barH + 2, accent.color);
}

/* ------------------------------------------------------------------ */
/* Main render                                                         */
/* ------------------------------------------------------------------ */

function screenShake(battle, simT, profile) {
  let mag = 0;
  for (const ev of impactsNear(battle, simT, profile.shakeDur)) {
    const since = simT - ev.t;
    if (since >= 0 && since < profile.shakeDur) {
      mag = Math.max(mag, 1 - since / profile.shakeDur);
    }
  }
  if (mag <= 0) return { x: 0, y: 0 };
  const t = simT * 90;
  return {
    x: Math.round(Math.sin(t * 1.7) * mag * 1.8),
    y: Math.round(Math.cos(t * 2.4) * mag * 1.1),
  };
}

export function renderBattle(request, profile = FREE_PROFILE) {
  const battle = simulateBattle(request);
  const { width, height, fps, floorHeight } = profile;

  const palette = buildPalette(
    hexToRgb(request.left && request.left.color),
    hexToRgb(request.right && request.right.color),
  );

  const timeline = buildTimeline(battle, profile);
  const framesCount = Math.max(2, Math.min(profile.maxFrames, timeline.frames));

  const floorY = height - floorHeight;
  const horizon = Math.max(28, floorY - 50);
  const bg = renderBackground(width, height, floorY, horizon);

  const weapons = {
    left: pickWeapon(battle.fighters.left.name),
    right: pickWeapon(battle.fighters.right.name),
  };

  const cxL = Math.round(width * 0.30);
  const cxR = Math.round(width * 0.70);
  const accents = {
    left: { side: 'left', color: C.L_LIGHT },
    right: { side: 'right', color: C.R_LIGHT },
  };
  const ramps = {
    left: { base: C.L_BASE, dark: C.L_DARK, darker: C.L_DARKER, light: C.L_LIGHT, lighter: C.L_LIGHTER },
    right: { base: C.R_BASE, dark: C.R_DARK, darker: C.R_DARKER, light: C.R_LIGHT, lighter: C.R_LIGHTER },
  };

  const result = [];
  for (let g = 0; g < framesCount; g++) {
    const simT = timeline.simAt(g / fps);
    result.push(renderFrame({
      width, height, floorY, battle, simT, bg, profile, weapons, cxL, cxR, ramps, accents,
    }));
  }

  return {
    frames: result,
    palette,
    width,
    height,
    delayMs: Math.round(1000 / fps),
    simSeconds: battle.duration,
    framesCount,
    timeline: {
      gifSeconds: timeline.gifDuration,
      attackScale: timeline.attackScale,
      idleCap: timeline.idleCap,
      beats: timeline.beats,
      totalBeats: timeline.totalBeats,
      segments: timeline.segments,
      simAt: timeline.simAt,
    },
  };
}

function renderFrame(ctx) {
  const {
    width: w, height: h, floorY, battle, simT, bg, profile,
    weapons, cxL, cxR, ramps, accents,
  } = ctx;
  const buf = new Uint8Array(w * h);

  const shake = screenShake(battle, simT, profile);
  blit(buf, bg, w, h, shake.x, shake.y);

  const stateL = computeFighterState(battle, 'left', simT);
  const stateR = computeFighterState(battle, 'right', simT);
  stateL.floorY = floorY;
  stateR.floorY = floorY;

  // Dust kicked up while lunging.
  for (const st of [stateL, stateR]) {
    if (st.mode === 'attack' && st.attackP > 0.3 && st.attackP < 0.75) {
      const p = (st.attackP - 0.3) / 0.45;
      const cx = st.side === 'left' ? cxL : cxR;
      const dir = st.side === 'left' ? 1 : -1;
      drawDust(buf, w, h, cx - dir * 9, floorY, p);
    }
  }

  // The attacker is drawn last so the lunge overlaps the opponent.
  const drawOrder = stateL.mode === 'attack' ? ['right', 'left'] : ['left', 'right'];
  for (const side of drawOrder) {
    const st = side === 'left' ? stateL : stateR;
    const cx = side === 'left' ? cxL : cxR;
    const face = side === 'left' ? 1 : -1;
    drawFighter(buf, w, h, floorY, cx, face, st, ramps[side], weapons[side]);
  }

  drawImpactEffects(buf, w, h, battle, simT, floorY, cxL, cxR);
  drawDamagePopups(buf, w, h, battle, simT, floorY, cxL, cxR);

  const plateL = drawNameplate(buf, w, h, cxL, cxR - cxL, stateL, accents.left);
  const plateR = drawNameplate(buf, w, h, cxR, cxR - cxL, stateR, accents.right);
  drawHealthBar(buf, w, h, cxL, plateL.barY, stateL, accents.left);
  drawHealthBar(buf, w, h, cxR, plateR.barY, stateR, accents.right);

  return buf;
}

function drawImpactEffects(buf, w, h, battle, simT, floorY, cxL, cxR) {
  for (const ev of impactsNear(battle, simT, 0.3)) {
    const since = simT - ev.t;
    if (since < 0 || since > 0.3) continue;
    const cx = ev.target === 'left' ? cxL : cxR;
    const cy = floorY - FIG.legH - FIG.bodyH * 0.6;
    drawSparks(buf, w, h, cx, cy, since / 0.3);
  }
}

function drawDamagePopups(buf, w, h, battle, simT, floorY, cxL, cxR) {
  const POPUP_DUR = 0.75;
  const baseY = floorY - FIG.legH - FIG.bodyH - FIG.neckH - FIG.headR * 2 - 4;
  for (const ev of impactsNear(battle, simT, POPUP_DUR)) {
    const since = simT - ev.t;
    if (since < 0 || since > POPUP_DUR) continue;
    const t = since / POPUP_DUR;
    const dir = ev.target === 'left' ? 1 : -1;
    const cx = (ev.target === 'left' ? cxL : cxR) + dir * 12;
    const y = baseY - Math.round(t * 12);
    const scale = since < 0.09 ? 2 : 1;
    drawTextOutlined(buf, w, h, String(ev.damage), cx, y, C.damage, scale);
  }
}
