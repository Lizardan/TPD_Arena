import { simulateBattle, ATTACK_DUR } from './battle.js';
import { drawTextCentered, measureText } from './font.js';

export const FREE_PROFILE = {
  width: 128,
  height: 96,
  fps: 8,
  maxDuration: 2.5,
  maxFrames: 20,
  holdAfter: 0.4,
  floorHeight: 14,
};

const PAL = {
  sky0: 0, sky1: 1, sky2: 2,
  floorLine: 3,
  shadow: 4,
  hpBg: 5, hpGreen: 6, hpYellow: 7, hpRed: 8,
  white: 9, damage: 10,
  bodyL: 11, bodyLShade: 12, bodyLLight: 13,
  bodyR: 14, bodyRShade: 15, bodyRLight: 16,
};

const DEFAULT_LEFT = [255, 155, 61];
const DEFAULT_RIGHT = [77, 166, 255];

const HIT_FLASH = 0.16;
const POPUP_DUR = 0.7;
const ARM_BASE = 4;
const ARM_EXT_MAX = 8;
const LUNGE_MAX = 6;
const NAME_SCALE = 2;
const MAX_NAME_W = 48;

export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function shade(rgb, f) {
  return [
    Math.min(255, Math.round(rgb[0] * f)),
    Math.min(255, Math.round(rgb[1] * f)),
    Math.min(255, Math.round(rgb[2] * f)),
  ];
}

function buildPalette(leftColor, rightColor) {
  const palette = [
    [14, 16, 28],
    [21, 23, 40],
    [30, 33, 54],
    [150, 152, 180],
    [8, 8, 12],
    [10, 10, 16],
    [82, 205, 92],
    [235, 205, 70],
    [225, 72, 72],
    [242, 242, 248],
    [255, 215, 92],
  ];
  for (const base of [leftColor || DEFAULT_LEFT, rightColor || DEFAULT_RIGHT]) {
    palette.push(base, shade(base, 0.6), shade(base, 1.45));
  }
  return palette;
}

function fillRect(buf, w, h, x, y, rw, rh, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.floor(x + rw));
  const y1 = Math.min(h, Math.floor(y + rh));
  for (let py = y0; py < y1; py++) {
    buf.fill(color, py * w + x0, py * w + x1);
  }
}

function fillCircle(buf, w, h, cx, cy, r, color) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      if (dx * dx + dy * dy <= r2) buf[py * w + px] = color;
    }
  }
}

/**
 * Renders an animated battle as indexed GIF frames.
 * Returns { frames, palette, width, height, delayMs }.
 */
export function renderBattle(request, profile = FREE_PROFILE) {
  const battle = simulateBattle(request);
  const { width, height, fps, maxDuration, maxFrames, holdAfter, floorHeight } = profile;

  const colorL = hexToRgb((request.left && request.left.color) || null);
  const colorR = hexToRgb((request.right && request.right.color) || null);
  const palette = buildPalette(colorL, colorR);

  // Time mapping: the whole battle fits the GIF window.
  let scale;
  let gifDur;
  if (battle.duration > maxDuration) {
    scale = maxDuration / battle.duration;
    gifDur = maxDuration;
  } else {
    scale = 1;
    gifDur = Math.min(maxDuration, battle.duration + holdAfter);
  }
  let frames = Math.max(2, Math.ceil(gifDur * fps));
  if (frames > maxFrames) {
    frames = maxFrames;
    scale = frames / fps / battle.duration;
  }

  const result = [];
  for (let g = 0; g < frames; g++) {
    const simT = g / (fps * scale);
    result.push(renderFrame(width, height, floorHeight, battle, simT));
  }

  return {
    frames: result,
    palette,
    width,
    height,
    delayMs: Math.round(1000 / fps),
    simSeconds: battle.duration,
    framesCount: frames,
  };
}

function renderFrame(w, h, floorHeight, battle, simT) {
  const buf = new Uint8Array(w * h);
  const floorY = h - floorHeight;
  const fy = floorY - 1;

  // Background sky bands.
  const bandH = Math.floor(fy / 3);
  buf.fill(PAL.sky0, 0, bandH * w);
  buf.fill(PAL.sky1, bandH * w, bandH * 2 * w);
  buf.fill(PAL.sky2, bandH * 2 * w, fy * w);

  // Floor.
  buf.fill(PAL.sky2, fy * w, floorY * w);
  buf.fill(PAL.floorLine, floorY * w, floorY * w + w);

  const cxL = Math.round(w * 0.3);
  const cxR = Math.round(w * 0.7);

  const stateL = fighterState(battle, 'left', simT);
  const stateR = fighterState(battle, 'right', simT);

  drawFighter(buf, w, h, fy, cxL, 1, stateL, PAL.bodyL, PAL.bodyLShade, PAL.bodyLLight);
  drawFighter(buf, w, h, fy, cxR, -1, stateR, PAL.bodyR, PAL.bodyRShade, PAL.bodyRLight);

  drawHud(buf, w, h, fy, cxL, stateL, battle, 'left');
  drawHud(buf, w, h, fy, cxR, stateR, battle, 'right');

  drawPopups(buf, w, h, fy, battle, simT, cxL, cxR);

  return buf;
}

function fighterState(battle, side, simT) {
  const st = {
    side,
    hp: battle.fighters[side].hp,
    maxHp: battle.fighters[side].hp,
    dead: false,
    attackP: -1,
    attackT: 0,
    hitFlash: 0,
    hitFloat: 0,
    damagedRecently: false,
    popupT: -1,
  };
  for (const ev of battle.events) {
    if (ev.t > simT) break;
    if (ev.type === 'impact' && ev.target === side) {
      st.hp = ev.hpAfter;
      st.popupT = ev.t;
      const since = simT - ev.t;
      if (since >= 0 && since < HIT_FLASH) {
        st.hitFlash = 1 - since / HIT_FLASH;
        st.hitFloat = Math.round((1 - since / HIT_FLASH) * 2);
        st.damagedRecently = true;
      }
    }
    if (ev.type === 'death' && ev.who === side) {
      st.dead = true;
      st.deadT = ev.t;
    }
    if (ev.type === 'attack' && ev.who === side) {
      st.attackT = ev.t;
      const since = simT - ev.t;
      if (since >= 0 && since < ATTACK_DUR) st.attackP = since / ATTACK_DUR;
    }
  }
  return st;
}

function drawFighter(buf, w, h, fy, cx, face, st, body, bodyShade, bodyLight) {
  const legH = 4;
  const torsH = 14;
  const torsW = 12;
  const headR = 5;

  const bob = st.dead ? 0 : Math.round(Math.sin(st.attackT * Math.PI * 2 * 0.8) * 1);

  let lunge = 0;
  let armLen = ARM_BASE;
  if (st.attackP >= 0 && st.attackP <= 1) {
    const k = Math.sin(st.attackP * Math.PI);
    lunge = Math.round(k * LUNGE_MAX);
    armLen = ARM_BASE + Math.round(k * ARM_EXT_MAX);
  }
  if (st.hitFloat > 0) lunge -= Math.round(st.hitFloat * 2) * face;

  const baseY = fy - bob;

  fillRect(buf, w, h, cx - 7, fy - 1, 14, 1, PAL.shadow);

  if (st.dead) {
    const layY = baseY - 5;
    fillRect(buf, w, h, Math.min(cx, cx + face * 12), layY, 12, 5, bodyShade);
    fillCircle(buf, w, h, cx + face * 15, layY + 2, 3, bodyShade);
    return;
  }

  const bodyTopY = baseY - legH - torsH;
  const headCy = bodyTopY - headR + 1;
  const bodyColor = st.hitFlash > 0 ? bodyLight : body;
  const headColor = st.hitFlash > 0 ? PAL.white : body;

  // Legs.
  fillRect(buf, w, h, cx - 4, baseY - legH, 3, legH, bodyShade);
  fillRect(buf, w, h, cx + 1, baseY - legH, 3, legH, bodyShade);

  // Torso.
  const tx = cx - torsW / 2 + lunge;
  fillRect(buf, w, h, tx, bodyTopY, torsW, torsH, bodyColor);
  // Back strip.
  const stripX = face === 1 ? tx + torsW - 3 : tx;
  fillRect(buf, w, h, stripX, bodyTopY, 3, torsH, bodyShade);

  // Arm toward the opponent.
  const shoulderY = bodyTopY + 4;
  const sx = face === 1 ? cx + torsW / 2 - 2 + lunge : cx - torsW / 2 + 2 + lunge;
  const armX = face === 1 ? sx - 1 : sx - armLen + 1;
  fillRect(buf, w, h, armX, shoulderY - 1, armLen + 2, 2, bodyShade);
  fillRect(buf, w, h, armX, shoulderY, armLen, 2, bodyColor);

  // Head.
  fillCircle(buf, w, h, cx + lunge, headCy, headR, headColor);
}

function drawHud(buf, w, h, fy, cx, st, battle, side) {
  const headTop = fy - 4 - 14 - 5 - 5 + 1;
  const barY = headTop - 7;
  const nameY = barY - 10;
  const barW = 24;
  const frac = st.maxHp > 0 ? st.hp / st.maxHp : 0;

  let label = (battle.fighters[side].name || '???').toUpperCase();
  while (label.length > 1 && measureText(label) * NAME_SCALE > MAX_NAME_W) {
    label = label.slice(0, -1);
  }

  // Dark pill behind the name so it stays readable over the sky.
  const tw = Math.round(measureText(label) * NAME_SCALE / 2);
  fillRect(buf, w, h, cx - tw - 2, nameY - 1, tw * 2 + 4, 12, PAL.shadow);
  drawTextCentered(buf, w, h, label, cx, nameY, PAL.white, NAME_SCALE);

  const bx = cx - barW / 2;
  fillRect(buf, w, h, bx, barY + 1, barW, 3, PAL.hpBg);
  const fillW = Math.round(barW * Math.min(1, Math.max(0, frac)));
  if (fillW > 0) {
    const color = frac > 0.5 ? PAL.hpGreen : frac > 0.25 ? PAL.hpYellow : PAL.hpRed;
    fillRect(buf, w, h, bx, barY + 1, fillW, 2, color);
  }
}

function drawPopups(buf, w, h, fy, battle, simT, cxL, cxR) {
  const baseY = fy - 27 - 10;
  for (const ev of battle.events) {
    if (ev.type !== 'impact') continue;
    const since = simT - ev.t;
    if (since < 0.08 || since > POPUP_DUR) continue;
    // Actually draw the full popup from the moment of impact; we need to include
    // the first frames. If since < 0 skip entirely (handled below).
    const centerX = ev.target === 'left' ? cxL : cxR;
    const p = (since - 0.08) / (POPUP_DUR - 0.08);
    const y = baseY - Math.round((since / POPUP_DUR) * 12);
    drawTextCentered(buf, w, h, String(ev.damage), centerX, y, PAL.damage, 1);

    // Impact spark inside the victim.
    if (since < 0.18) drawSpark(buf, w, h, centerX, fy - 23, 1 - since / 0.18);
  }
}

function drawSpark(buf, w, h, cx, cy, strength) {
  const len = 3;
  buf[Math.min(h - 1, Math.max(0, cy)) * w + Math.min(w - 1, Math.max(0, cx))] = PAL.white;
  fillRect(buf, w, h, cx - len, cy, len * 2 + 1, 1, PAL.white);
  fillRect(buf, w, h, cx, cy - len, 1, len * 2 + 1, PAL.white);
}