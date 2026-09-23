var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/battle.js
var IMPACT_DELAY = 0.09;
var MAX_SIM_DURATION = 60;
var MIN_ATTACK_SPEED = 0.1;
var MAX_ATTACK_SPEED = 10;
var MIN_HP = 1;
var MAX_HP = 999;
var MIN_POWER = 1;
var MAX_POWER = 999;
function clampInt(value, min, max, field) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return n;
}
__name(clampInt, "clampInt");
function sanitizeName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 24 ? trimmed.slice(0, 24) : trimmed;
}
__name(sanitizeName, "sanitizeName");
function normalizeFighter(raw, side) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${side} fighter is missing.`);
  }
  const attackSpeed = Number(raw.attackSpeed);
  if (!Number.isFinite(attackSpeed) || attackSpeed < MIN_ATTACK_SPEED || attackSpeed > MAX_ATTACK_SPEED) {
    throw new Error(`${side}.attackSpeed must be between ${MIN_ATTACK_SPEED} and ${MAX_ATTACK_SPEED}.`);
  }
  return {
    name: sanitizeName(raw.name, side === "left" ? "\u041B\u0415\u0412\u042B\u0419" : "\u041F\u0420\u0410\u0412\u042B\u0419"),
    hp: clampInt(raw.hp, MIN_HP, MAX_HP, `${side}.hp`),
    attackPower: clampInt(raw.attackPower, MIN_POWER, MAX_POWER, `${side}.attackPower`),
    attackSpeed,
    color: typeof raw.color === "string" ? raw.color : null
  };
}
__name(normalizeFighter, "normalizeFighter");
var ATTACK_RANK = { left: 0, right: 1 };
function simulateBattle(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Battle request is missing.");
  }
  const left = normalizeFighter(request.left, "left");
  const right = normalizeFighter(request.right, "right");
  const fighters = { left, right };
  const hp = { left: left.hp, right: right.hp };
  const interval = {
    left: 1 / left.attackSpeed,
    right: 1 / right.attackSpeed
  };
  const nextAttack = { left: interval.left, right: interval.right };
  const events = [];
  const impacts = [];
  let winner = null;
  let endT = MAX_SIM_DURATION;
  const pushImpact = /* @__PURE__ */ __name((imp) => {
    impacts.push(imp);
    impacts.sort((a, b) => a.t - b.t || ATTACK_RANK[a.attacker] - ATTACK_RANK[b.attacker]);
  }, "pushImpact");
  while (true) {
    const nextImpactT = impacts.length > 0 ? impacts[0].t : Infinity;
    const nextAttackT = Math.min(nextAttack.left, nextAttack.right);
    const t = Math.min(nextImpactT, nextAttackT);
    if (t >= MAX_SIM_DURATION) {
      endT = MAX_SIM_DURATION;
      break;
    }
    if (nextImpactT <= nextAttackT) {
      const imp = impacts.shift();
      const target2 = imp.target;
      hp[target2] = Math.max(0, hp[target2] - imp.damage);
      events.push({
        t: imp.t,
        type: "impact",
        attacker: imp.attacker,
        target: target2,
        damage: imp.damage,
        hpAfter: hp[target2]
      });
      if (hp[target2] <= 0) {
        winner = imp.attacker;
        events.push({ t: imp.t, type: "death", who: target2 });
        endT = imp.t;
        break;
      }
      continue;
    }
    const who = nextAttack.left <= nextAttack.right ? "left" : "right";
    const target = who === "left" ? "right" : "left";
    nextAttack[who] += interval[who];
    events.push({ t: nextAttackT, type: "attack", who });
    pushImpact({
      t: nextAttackT + IMPACT_DELAY,
      attacker: who,
      target,
      damage: fighters[who].attackPower
    });
  }
  events.push({ t: endT, type: "end", winner });
  return {
    duration: endT,
    winner,
    finalHp: { left: hp.left, right: hp.right },
    fighters: { left, right },
    events
  };
}
__name(simulateBattle, "simulateBattle");
function battleResultText(battle) {
  const winner = battle.fighters[battle.winner];
  const loser = battle.winner === "left" ? battle.fighters.right : battle.fighters.left;
  const winnerHp = battle.finalHp[battle.winner];
  return `\u{1F3C6} ${winner.name} \u043F\u043E\u0431\u0435\u0434\u0438\u043B ${loser.name} (\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C HP: ${winnerHp})`;
}
__name(battleResultText, "battleResultText");

// src/font.js
var GLYPH_W = 3;
var GLYPH_H = 5;
var ADVANCE = GLYPH_W + 1;
var G = {
  " ": [0, 0, 0, 0, 0],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [7, 1, 7, 4, 7],
  "3": [7, 1, 7, 1, 7],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 7, 1, 7],
  "6": [7, 4, 7, 5, 7],
  "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7],
  "9": [7, 5, 7, 1, 7],
  "A": [2, 5, 7, 5, 5],
  "B": [6, 5, 6, 5, 6],
  "C": [7, 4, 4, 4, 7],
  "D": [6, 5, 5, 5, 6],
  "E": [7, 4, 7, 4, 7],
  "F": [7, 4, 7, 4, 4],
  "G": [7, 4, 5, 5, 7],
  "H": [5, 5, 7, 5, 5],
  "I": [7, 2, 2, 2, 7],
  "J": [1, 1, 1, 5, 2],
  "K": [5, 5, 6, 5, 5],
  "L": [4, 4, 4, 4, 7],
  "M": [5, 7, 7, 5, 5],
  "N": [5, 7, 7, 7, 5],
  "O": [7, 5, 5, 5, 7],
  "P": [7, 5, 7, 4, 4],
  "Q": [7, 5, 5, 7, 1],
  "R": [7, 5, 7, 6, 5],
  "S": [7, 4, 7, 1, 7],
  "T": [7, 2, 2, 2, 2],
  "U": [5, 5, 5, 5, 7],
  "V": [5, 5, 5, 5, 2],
  "W": [5, 5, 7, 7, 5],
  "X": [5, 5, 2, 5, 5],
  "Y": [5, 5, 2, 2, 2],
  "Z": [7, 1, 2, 4, 7],
  "-": [0, 0, 7, 0, 0],
  "+": [0, 2, 7, 2, 0],
  "@": [7, 5, 7, 4, 7],
  ".": [0, 0, 0, 0, 2],
  "!": [2, 2, 2, 0, 2],
  "?": [7, 1, 7, 0, 2],
  ":": [0, 2, 0, 2, 0],
  "_": [0, 0, 0, 0, 7],
  // Cyrillic
  "\u0410": [2, 5, 7, 5, 5],
  "\u0411": [7, 4, 7, 5, 7],
  "\u0412": [6, 5, 6, 5, 6],
  "\u0413": [7, 4, 4, 4, 4],
  "\u0414": [3, 3, 3, 5, 7],
  "\u0415": [7, 4, 7, 4, 7],
  "\u0416": [5, 5, 7, 5, 5],
  "\u0417": [7, 1, 7, 1, 7],
  "\u0418": [5, 7, 7, 5, 5],
  "\u0419": [2, 0, 5, 7, 5],
  "\u041A": [5, 5, 6, 5, 5],
  "\u041B": [3, 5, 5, 5, 5],
  "\u041C": [5, 7, 7, 5, 5],
  "\u041D": [5, 5, 7, 5, 5],
  "\u041E": [7, 5, 5, 5, 7],
  "\u041F": [7, 5, 5, 5, 5],
  "\u0420": [7, 5, 7, 4, 4],
  "\u0421": [7, 4, 4, 4, 7],
  "\u0422": [7, 2, 2, 2, 2],
  "\u0423": [5, 5, 7, 1, 7],
  "\u0424": [2, 7, 2, 7, 2],
  "\u0425": [5, 5, 2, 5, 5],
  "\u0426": [5, 5, 5, 5, 7],
  "\u0427": [5, 5, 7, 1, 1],
  "\u0428": [5, 5, 5, 5, 7],
  "\u0429": [7, 5, 5, 5, 7],
  "\u042A": [6, 4, 6, 4, 6],
  "\u042B": [5, 5, 5, 7, 4],
  "\u042C": [4, 4, 4, 4, 6],
  "\u042D": [7, 1, 7, 5, 7],
  "\u042E": [5, 7, 7, 5, 5],
  "\u042F": [7, 1, 7, 5, 5],
  "\u0401": [5, 0, 7, 4, 7]
};
function measureText(str) {
  const n = str.length;
  return n === 0 ? 0 : n * ADVANCE - 1;
}
__name(measureText, "measureText");
function drawText(buf, width, height, str, x, y, color, scale = 1) {
  let cx = x;
  const upper = String(str).toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const glyph = G[upper[i]] || G["?"];
    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row];
      for (let col = 0; col < GLYPH_W; col++) {
        if (bits >> GLYPH_W - 1 - col & 1) {
          fillCell(buf, width, height, cx + col * scale, y + row * scale, scale, color);
        }
      }
    }
    cx += ADVANCE * scale;
  }
  return cx - x - (ADVANCE - GLYPH_W) * scale;
}
__name(drawText, "drawText");
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
__name(fillCell, "fillCell");
function drawTextCentered(buf, width, height, str, cx, y, color, scale = 1) {
  const w = measureText(str) * scale;
  return drawText(buf, width, height, str, Math.round(cx - w / 2), y, color, scale);
}
__name(drawTextCentered, "drawTextCentered");

// src/palette.js
var C = {
  sky0: 0,
  sky1: 1,
  sky2: 2,
  sky3: 3,
  mtnFar: 4,
  mtnNear: 5,
  wall: 6,
  wallLight: 7,
  floor0: 8,
  floor1: 9,
  floorLine: 10,
  shadow: 11,
  outline: 12,
  hpBg: 13,
  hpFrame: 14,
  hpGreen: 15,
  hpYellow: 16,
  hpRed: 17,
  hpGhost: 18,
  white: 19,
  damage: 20,
  spark: 21,
  skin: 22,
  skinShade: 23,
  metal: 24,
  metalShade: 25,
  wood: 26,
  woodShade: 27,
  dust: 28,
  // Per fighter colour ramps (5 tones each), assigned at palette build time.
  L_DARKER: 29,
  L_DARK: 30,
  L_BASE: 31,
  L_LIGHT: 32,
  L_LIGHTER: 33,
  R_DARKER: 34,
  R_DARK: 35,
  R_BASE: 36,
  R_LIGHT: 37,
  R_LIGHTER: 38
};
var STATIC_COLORS = [
  [30, 34, 62],
  // sky0  - deep zenith
  [44, 50, 86],
  // sky1
  [62, 68, 108],
  // sky2
  [86, 90, 134],
  // sky3  - near horizon haze
  [58, 62, 100],
  // mtnFar
  [42, 46, 78],
  // mtnNear
  [34, 32, 52],
  // wall
  [48, 46, 70],
  // wallLight
  [76, 58, 48],
  // floor0 - arena sand
  [92, 71, 57],
  // floor1
  [118, 94, 74],
  // floorLine
  [16, 16, 26],
  // shadow
  [12, 12, 20],
  // outline
  [26, 26, 38],
  // hpBg
  [8, 8, 14],
  // hpFrame
  [92, 214, 104],
  // hpGreen
  [240, 208, 72],
  // hpYellow
  [232, 76, 76],
  // hpRed
  [206, 206, 218],
  // hpGhost - trailing bar of recently lost HP
  [248, 248, 254],
  // white
  [255, 228, 118],
  // damage
  [255, 252, 210],
  // spark
  [236, 182, 136],
  // skin
  [186, 132, 96],
  // skinShade
  [214, 222, 234],
  // metal
  [140, 150, 170],
  // metalShade
  [126, 82, 48],
  // wood
  [86, 54, 32],
  // woodShade
  [158, 146, 124]
  // dust
];
var DEFAULT_LEFT = [255, 155, 61];
var DEFAULT_RIGHT = [77, 166, 255];
function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [v >> 16 & 255, v >> 8 & 255, v & 255];
}
__name(hexToRgb, "hexToRgb");
function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
__name(clamp, "clamp");
function darken(rgb, f) {
  return [clamp(rgb[0] * f), clamp(rgb[1] * f), clamp(rgb[2] * f)];
}
__name(darken, "darken");
function lighten(rgb, f) {
  return [
    clamp(rgb[0] + (255 - rgb[0]) * f),
    clamp(rgb[1] + (255 - rgb[1]) * f),
    clamp(rgb[2] + (255 - rgb[2]) * f)
  ];
}
__name(lighten, "lighten");
function buildPalette(leftColor, rightColor) {
  const left = leftColor || DEFAULT_LEFT;
  const right = rightColor || DEFAULT_RIGHT;
  return [
    ...STATIC_COLORS,
    darken(left, 0.42),
    darken(left, 0.7),
    left.slice(),
    lighten(left, 0.34),
    lighten(left, 0.56),
    darken(right, 0.42),
    darken(right, 0.7),
    right.slice(),
    lighten(right, 0.34),
    lighten(right, 0.56)
  ];
}
__name(buildPalette, "buildPalette");

// src/draw.js
function rect(buf, w, h, x, y, rw, rh, color) {
  if (rw <= 0 || rh <= 0) return;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(w, Math.round(x + rw));
  const y1 = Math.min(h, Math.round(y + rh));
  for (let py = y0; py < y1; py++) {
    buf.fill(color, py * w + x0, py * w + x1);
  }
}
__name(rect, "rect");
function circle(buf, w, h, cx, cy, r, color) {
  ellipse(buf, w, h, cx, cy, r, r, color);
}
__name(circle, "circle");
function ellipse(buf, w, h, cx, cy, rx, ry, color) {
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
__name(ellipse, "ellipse");
function dome(buf, w, h, cx, cy, rx, ry, color) {
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
__name(dome, "dome");
function line(buf, w, h, x0, y0, x1, y1, color, thick = 1) {
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
__name(line, "line");
function triangle(buf, w, h, x0, y0, x1, y1, x2, y2, color) {
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
__name(triangle, "triangle");
function shearRect(buf, w, h, x, y, rw, rh, shear, color) {
  for (let i = 0; i < rh; i++) {
    const t = rh <= 1 ? 0 : i / (rh - 1);
    rect(buf, w, h, x + shear * t, y + i, rw, 1, color);
  }
}
__name(shearRect, "shearRect");
function mirrorRect(buf, w, h, cx, face, lx, y, rw, rh, color) {
  const x = face === 1 ? cx + lx : cx - lx - rw;
  rect(buf, w, h, x, y, rw, rh, color);
}
__name(mirrorRect, "mirrorRect");

// src/timeline.js
var MIN_IDLE_GAP = 0.06;
var GAP_MIN_FRAMES = 2;
var GAP_MAX_FRAMES = 4;
var ACTION_MIN_FRAMES = 3.5;
var ACTION_MAX_FRAMES = 6;
var MAX_BEAT = 1.2;
var ACTION_SCALE_FLOOR = 0.4;
function attackAnimDuration(attackSpeed, maxAnim = 0.5) {
  const interval = 1 / attackSpeed;
  const d = Math.min(maxAnim, interval * 0.7);
  return Math.max(0.22, d);
}
__name(attackAnimDuration, "attackAnimDuration");
function collectWindows(battle, maxAnim) {
  const raw = [];
  for (const ev of battle.events) {
    if (ev.type === "attack") {
      const speed = battle.fighters[ev.who].attackSpeed;
      raw.push({ t0: ev.t, t1: ev.t + attackAnimDuration(speed, maxAnim), death: false });
    }
  }
  const death = battle.events.find((e) => e.type === "death");
  if (death) raw.push({ t0: death.t, t1: death.t + 0.6, death: true, deathT: death.t });
  raw.sort((a, b) => a.t0 - b.t0);
  const merged = [];
  for (const win of raw) {
    const last = merged[merged.length - 1];
    if (last && win.t0 <= last.t1 && win.t1 - last.t0 <= MAX_BEAT) {
      last.t1 = Math.max(last.t1, win.t1);
      if (win.death) {
        last.death = true;
        last.deathT = win.deathT;
      }
    } else {
      merged.push({ ...win });
    }
  }
  return merged;
}
__name(collectWindows, "collectWindows");
function selectEvenly(windows, count) {
  if (count >= windows.length) return windows.map((_, i) => i);
  if (count <= 1) return [windows.length - 1];
  const idx = [];
  for (let k = 0; k < count; k++) {
    idx.push(Math.round(k * (windows.length - 1) / (count - 1)));
  }
  return [...new Set(idx)];
}
__name(selectEvenly, "selectEvenly");
function unionIntervals(list) {
  const out = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv.t0 <= last.t1) last.t1 = Math.max(last.t1, iv.t1);
    else out.push({ t0: iv.t0, t1: iv.t1 });
  }
  return out;
}
__name(unionIntervals, "unionIntervals");
function longestFreeGap(busy, a, b) {
  if (b <= a) return null;
  let best = null;
  let cursor = a;
  for (const w of busy) {
    if (w.t1 <= a) continue;
    if (w.t0 >= b) break;
    const freeEnd = Math.min(w.t0, b);
    if (freeEnd > cursor && (!best || freeEnd - cursor > best[1] - best[0])) {
      best = [cursor, freeEnd];
    }
    cursor = Math.max(cursor, w.t1);
    if (cursor >= b) break;
  }
  if (b > cursor && (!best || b - cursor > best[1] - best[0])) best = [cursor, b];
  return best;
}
__name(longestFreeGap, "longestFreeGap");
function buildTimeline(battle, cfg) {
  const {
    fps,
    maxFrames,
    holdAfter = 0.5,
    maxAttackAnim = 0.5
  } = cfg;
  const windows = collectWindows(battle, maxAttackAnim);
  const holdFrames = Math.max(1, Math.round(holdAfter * fps));
  const beatFrames = /* @__PURE__ */ __name((w) => {
    const play = Math.min(w.t1 - w.t0, ACTION_MAX_FRAMES / fps);
    return Math.max(ACTION_MIN_FRAMES, Math.min(ACTION_MAX_FRAMES, play * fps));
  }, "beatFrames");
  const frameCost = /* @__PURE__ */ __name((picked) => picked.reduce((s, w) => s + beatFrames(w), 0) + picked.length * GAP_MIN_FRAMES + holdFrames, "frameCost");
  const ceiling = Math.min(
    windows.length,
    Math.max(1, Math.floor((maxFrames - holdFrames) / (ACTION_MIN_FRAMES + GAP_MIN_FRAMES)))
  );
  let chosen = null;
  for (let count = ceiling; count >= 1; count--) {
    const picked = selectEvenly(windows, count).map((i) => windows[i]);
    if (frameCost(picked) <= maxFrames) {
      chosen = picked;
      break;
    }
  }
  if (!chosen) chosen = [windows[windows.length - 1]];
  const actionFrames = chosen.map(beatFrames);
  const gapCount = chosen.length;
  const actionTotal = actionFrames.reduce((a, b) => a + b, 0);
  let gapFrames = GAP_MIN_FRAMES;
  const spare = maxFrames - holdFrames - actionTotal - gapCount * gapFrames;
  if (spare > 0) gapFrames = Math.min(GAP_MAX_FRAMES, gapFrames + Math.floor(spare / gapCount));
  const segments = [];
  let gifCursor = 0;
  let simCursor = 0;
  const push = /* @__PURE__ */ __name((simT0, simT1, kind, gifLen) => {
    if (simT1 <= simT0 || gifLen <= 0) return;
    segments.push({ simT0, simT1, gifT0: gifCursor, gifT1: gifCursor + gifLen, kind });
    gifCursor += gifLen;
  }, "push");
  const busy = unionIntervals(windows);
  const pauseLen = gapFrames / fps;
  const pushPause = /* @__PURE__ */ __name((simA, simB) => {
    const free = longestFreeGap(busy, simA, simB);
    if (!free || free[1] - free[0] < MIN_IDLE_GAP) return;
    const len = Math.min(pauseLen, free[1] - free[0]);
    const mid = (free[0] + free[1]) / 2;
    push(mid - len / 2, mid + len / 2, "idle", pauseLen);
  }, "pushPause");
  chosen.forEach((w, i) => {
    pushPause(simCursor, w.t0);
    const playLen = Math.min(w.t1 - w.t0, ACTION_MAX_FRAMES / fps);
    const playStart = w.deathT !== void 0 ? Math.max(w.t0, Math.min(w.deathT, w.t1 - playLen)) : w.t0;
    push(playStart, playStart + playLen, "action", actionFrames[i] / fps);
    simCursor = Math.max(simCursor, w.t1);
  });
  const tailEnd = Math.max(battle.duration, ...chosen.map((w) => w.t1));
  pushPause(simCursor, tailEnd);
  push(tailEnd, tailEnd + holdAfter, "hold", holdFrames / fps);
  let frames = Math.max(2, Math.ceil(gifCursor * fps));
  let attackScale = 1;
  if (frames > maxFrames) {
    const k = Math.max(ACTION_SCALE_FLOOR * 0.5, maxFrames / frames);
    let cursor = 0;
    const scaled = segments.map((s) => {
      const len = (s.gifT1 - s.gifT0) * k;
      const seg = { ...s, gifT0: cursor, gifT1: cursor + len };
      cursor += len;
      return seg;
    });
    segments.length = 0;
    segments.push(...scaled);
    gifCursor = cursor;
    attackScale = k;
    frames = maxFrames;
  }
  const simAt = /* @__PURE__ */ __name((gifT) => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (gifT < s.gifT1 || i === segments.length - 1) {
        const span = s.gifT1 - s.gifT0;
        if (span <= 0) return s.simT1;
        const t = Math.min(1, Math.max(0, (gifT - s.gifT0) / span));
        return s.simT0 + (s.simT1 - s.simT0) * t;
      }
    }
    return tailEnd;
  }, "simAt");
  return {
    segments,
    gifDuration: gifCursor,
    frames,
    simAt,
    attackScale,
    idleCap: gapFrames / fps,
    beats: chosen.length,
    totalBeats: windows.length
  };
}
__name(buildTimeline, "buildTimeline");

// src/fighter.js
var FIG = {
  legH: 18,
  bodyH: 20,
  bodyW: 15,
  headR: 5,
  neckH: 4,
  shoulderFromTop: 4
};
var HURT_DUR = 0.26;
var DEATH_DUR = 0.7;
var clamp01 = /* @__PURE__ */ __name((v) => v < 0 ? 0 : v > 1 ? 1 : v, "clamp01");
var lerp = /* @__PURE__ */ __name((a, b, t) => a + (b - a) * t, "lerp");
var easeOutCubic = /* @__PURE__ */ __name((t) => 1 - Math.pow(1 - t, 3), "easeOutCubic");
var easeInQuad = /* @__PURE__ */ __name((t) => t * t, "easeInQuad");
var easeOutQuad = /* @__PURE__ */ __name((t) => 1 - (1 - t) * (1 - t), "easeOutQuad");
var oRect = /* @__PURE__ */ __name((buf, w, h, x, y, rw, rh, color) => {
  rect(buf, w, h, x - 1, y - 1, rw + 2, rh + 2, C.outline);
  rect(buf, w, h, x, y, rw, rh, color);
}, "oRect");
var oMirrorRect = /* @__PURE__ */ __name((buf, w, h, cx, face, lx, y, rw, rh, color) => {
  mirrorRect(buf, w, h, cx, face, lx - 1, y - 1, rw + 2, rh + 2, C.outline);
  mirrorRect(buf, w, h, cx, face, lx, y, rw, rh, color);
}, "oMirrorRect");
var oCircle = /* @__PURE__ */ __name((buf, w, h, cx, cy, r, color) => {
  circle(buf, w, h, cx, cy, r + 1, C.outline);
  circle(buf, w, h, cx, cy, r, color);
}, "oCircle");
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
__name(hashStr, "hashStr");
var WEAPONS = ["sword", "mace", "spear"];
function pickWeapon(name) {
  return WEAPONS[hashStr(String(name || "?")) % WEAPONS.length];
}
__name(pickWeapon, "pickWeapon");
var EVENT_INDEX = /* @__PURE__ */ new WeakMap();
function eventIndex(battle) {
  let idx = EVENT_INDEX.get(battle);
  if (idx) return idx;
  const mkSide = /* @__PURE__ */ __name(() => ({ attacks: [], impacts: [], deathT: -1 }), "mkSide");
  idx = { left: mkSide(), right: mkSide(), impacts: [] };
  for (const ev of battle.events) {
    if (ev.type === "attack") {
      idx[ev.who].attacks.push(ev.t);
    } else if (ev.type === "impact") {
      const rec = { t: ev.t, hpAfter: ev.hpAfter, target: ev.target, damage: ev.damage };
      idx[ev.target].impacts.push(rec);
      idx.impacts.push(rec);
    } else if (ev.type === "death") {
      idx[ev.who].deathT = ev.t;
    }
  }
  EVENT_INDEX.set(battle, idx);
  return idx;
}
__name(eventIndex, "eventIndex");
function lastIndexAtOrBefore(arr, limit) {
  let lo = 0;
  let hi = arr.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (arr[mid].t <= limit) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
__name(lastIndexAtOrBefore, "lastIndexAtOrBefore");
function lastTimeAtOrBefore(times, limit) {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (times[mid] <= limit) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
__name(lastTimeAtOrBefore, "lastTimeAtOrBefore");
function impactsNear(battle, simT, window) {
  const all = eventIndex(battle).impacts;
  const end = lastIndexAtOrBefore(all, simT);
  const out = [];
  for (let i = end; i >= 0; i--) {
    if (simT - all[i].t > window) break;
    out.push(all[i]);
  }
  return out;
}
__name(impactsNear, "impactsNear");
function computeFighterState(battle, side, simT) {
  const fighter = battle.fighters[side];
  const st = {
    side,
    name: fighter.name,
    hp: fighter.hp,
    maxHp: fighter.hp,
    ghostHp: fighter.hp,
    mode: "idle",
    attackP: 0,
    attackAnim: attackAnimDuration(fighter.attackSpeed),
    hitFlash: 0,
    hurtP: 0,
    deadP: 0,
    dead: false,
    simT,
    lastAttackT: -1,
    lastHitT: -1
  };
  const idx = eventIndex(battle)[side];
  const attackDur = st.attackAnim;
  const atkIdx = lastTimeAtOrBefore(idx.attacks, simT);
  const attackT = atkIdx >= 0 ? idx.attacks[atkIdx] : -1;
  const hitIdx = lastIndexAtOrBefore(idx.impacts, simT);
  let hitT = -1;
  if (hitIdx >= 0) {
    hitT = idx.impacts[hitIdx].t;
    st.hp = idx.impacts[hitIdx].hpAfter;
  }
  const deathT = idx.deathT >= 0 && simT >= idx.deathT ? idx.deathT : -1;
  const ghostIdx = lastIndexAtOrBefore(idx.impacts, simT - 0.35);
  if (ghostIdx >= 0) st.ghostHp = idx.impacts[ghostIdx].hpAfter;
  if (deathT >= 0) {
    st.dead = true;
    st.mode = "dead";
    st.deadP = clamp01((simT - deathT) / DEATH_DUR);
    st.deadT = deathT;
  } else if (attackT >= 0 && simT - attackT < attackDur) {
    st.mode = "attack";
    st.attackP = clamp01((simT - attackT) / attackDur);
    st.attackAnim = attackDur;
  } else if (hitT >= 0 && simT - hitT < HURT_DUR) {
    st.mode = "hurt";
    st.hurtP = clamp01((simT - hitT) / HURT_DUR);
  }
  st.lastAttackT = attackT;
  st.lastHitT = hitT;
  if (hitT >= 0) {
    const since = simT - hitT;
    if (since < 0.13) st.hitFlash = 1 - since / 0.13;
  }
  return st;
}
__name(computeFighterState, "computeFighterState");
function basePose() {
  return {
    lunge: 0,
    bob: 0,
    lean: 0,
    handX: 5,
    handY: 4,
    // Weapon angle: 0 = straight down, PI/2 = straight forward, PI = up.
    // The guard stance holds the blade forward and low, ready to swing.
    weapon: 0.9,
    legFront: 3,
    legBack: -4,
    headTilt: 0,
    fall: 0,
    drop: 0,
    backArm: -0.5
  };
}
__name(basePose, "basePose");
function idlePose(st) {
  const pose = basePose();
  const p = st.simT * 0.8 % 1;
  const q = st.simT * 0.37 % 1;
  const breath = Math.sin(p * Math.PI * 2);
  const sway = Math.sin(q * Math.PI * 2);
  pose.bob = breath * 0.9;
  pose.lean = breath * 0.3 + sway * 0.22;
  pose.handX = 5 + breath * 0.6;
  pose.handY = 4 + breath * 0.5;
  pose.weapon = 0.9 + sway * 0.16 + breath * 0.08;
  pose.headTilt = sway * 0.6;
  pose.legFront = 3 + sway * 0.7;
  pose.legBack = -4 - sway * 0.5;
  pose.backArm = -0.5 + sway * 0.15;
  return pose;
}
__name(idlePose, "idlePose");
function attackPose(st) {
  const pose = basePose();
  const p = clamp01(st.attackP);
  const WINDUP = 0.34;
  const STRIKE = 0.22;
  if (p < WINDUP) {
    const e = easeOutCubic(p / WINDUP);
    pose.weapon = lerp(0.9, -2.5, e);
    pose.lean = lerp(0, -1.8, e);
    pose.lunge = lerp(0, -3, e);
    pose.bob = lerp(0, -1.2, e);
    pose.handX = lerp(5, 0, e);
    pose.handY = lerp(4, -6, e);
    pose.headTilt = lerp(0, -1.2, e);
    pose.legFront = lerp(3, 4.5, e);
    pose.legBack = lerp(-4, -6.5, e);
    pose.backArm = lerp(-0.5, -1.7, e);
  } else if (p < WINDUP + STRIKE) {
    const e = easeInQuad((p - WINDUP) / STRIKE);
    pose.weapon = lerp(-2.5, 0.95, e);
    pose.lean = lerp(-1.8, 2.8, e);
    pose.lunge = lerp(-3, 14, e);
    pose.bob = lerp(-1.2, 0.6, e);
    pose.handX = lerp(0, 15, e);
    pose.handY = lerp(-6, 2, e);
    pose.headTilt = lerp(-1.2, 1, e);
    pose.legFront = lerp(4.5, 7, e);
    pose.legBack = lerp(-6.5, -9.5, e);
    pose.backArm = lerp(-1.7, 1.4, e);
  } else {
    const e = easeOutCubic((p - WINDUP - STRIKE) / (1 - WINDUP - STRIKE));
    pose.weapon = lerp(0.95, 0.9, e);
    pose.lean = lerp(2.8, 0, e);
    pose.lunge = lerp(14, 0, e);
    pose.bob = lerp(0.6, 0, e);
    pose.handX = lerp(15, 5, e);
    pose.handY = lerp(2, 4, e);
    pose.headTilt = lerp(1, 0, e);
    pose.legFront = lerp(7, 3, e);
    pose.legBack = lerp(-9.5, -4, e);
    pose.backArm = lerp(1.4, -0.5, e);
  }
  return pose;
}
__name(attackPose, "attackPose");
function hurtPose(st) {
  const pose = basePose();
  const k = Math.sin(clamp01(st.hurtP) * Math.PI);
  pose.lunge = -4.2 * k;
  pose.lean = -2.4 * k;
  pose.bob = 0.7 * k;
  pose.weapon = 0.9 - 1.1 * k;
  pose.handX = 5 - 4 * k;
  pose.handY = 4 - 2.5 * k;
  pose.headTilt = -1.6 * k;
  pose.legFront = 3 - 2 * k;
  pose.legBack = -4 - 1.2 * k;
  pose.backArm = -0.5 - 0.9 * k;
  return pose;
}
__name(hurtPose, "hurtPose");
function deadPose(st) {
  const pose = basePose();
  const t = clamp01(st.deadP);
  const fall = easeOutQuad(clamp01(t / 0.75));
  pose.fall = fall;
  pose.drop = fall * (FIG.bodyH * 0.85);
  pose.lean = -fall * 2.3;
  pose.lunge = -fall * 3.5;
  pose.weapon = lerp(0.9, -1.8, fall);
  pose.handX = lerp(5, 5, fall);
  pose.handY = lerp(4, 11, fall);
  pose.headTilt = -fall * 2.2;
  pose.legFront = 3 + fall * 5;
  pose.legBack = -4 + fall * 4;
  pose.backArm = -0.5 - fall * 1.6;
  return pose;
}
__name(deadPose, "deadPose");
function computePose(st) {
  if (st.mode === "dead") return deadPose(st);
  if (st.mode === "attack") return attackPose(st);
  if (st.mode === "hurt") return hurtPose(st);
  return idlePose(st);
}
__name(computePose, "computePose");
function drawWeapon(buf, w, h, hx, hy, face, angle, type, white) {
  const dirX = face * Math.sin(angle);
  const dirY = Math.cos(angle);
  const px = /* @__PURE__ */ __name((d) => hx + dirX * d, "px");
  const py = /* @__PURE__ */ __name((d) => hy + dirY * d, "py");
  const perpX = -dirY * face;
  const perpY = dirX * face;
  const metal = white ? C.white : C.metal;
  const metalDark = white ? C.white : C.metalShade;
  const wood = white ? C.white : C.wood;
  const woodDark = white ? C.white : C.woodShade;
  if (type === "mace") {
    line(buf, w, h, px(-5), py(-5), px(12), py(12), C.outline, 4);
    line(buf, w, h, px(-5), py(-5), px(12), py(12), woodDark, 3);
    line(buf, w, h, px(-5), py(-5), px(12), py(12), wood, 1);
    const hx2 = px(15);
    const hy2 = py(15);
    circle(buf, w, h, hx2, hy2, 5.5, C.outline);
    circle(buf, w, h, hx2, hy2, 4.2, metalDark);
    circle(buf, w, h, hx2 - 1, hy2 - 1, 2.4, metal);
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      triangle(
        buf,
        w,
        h,
        hx2 + ax * 8,
        hy2 + ay * 8,
        hx2 + ax * 3.5 + ay * 2.4,
        hy2 + ay * 3.5 + ax * 2.4,
        hx2 + ax * 3.5 - ay * 2.4,
        hy2 + ay * 3.5 - ax * 2.4,
        metal
      );
    }
    return;
  }
  if (type === "spear") {
    line(buf, w, h, px(-7), py(-7), px(17), py(17), C.outline, 4);
    line(buf, w, h, px(-7), py(-7), px(17), py(17), woodDark, 3);
    line(buf, w, h, px(-7), py(-7), px(17), py(17), wood, 1);
    triangle(
      buf,
      w,
      h,
      px(23),
      py(23),
      px(16) + perpX * 3,
      py(16) + perpY * 3,
      px(16) - perpX * 3,
      py(16) - perpY * 3,
      metal
    );
    triangle(
      buf,
      w,
      h,
      px(23),
      py(23),
      px(18) + perpX * 1.4,
      py(18) + perpY * 1.4,
      px(18) - perpX * 1.4,
      py(18) - perpY * 1.4,
      metalDark
    );
    return;
  }
  line(buf, w, h, px(-4), py(-4), px(0), py(0), C.outline, 4);
  line(buf, w, h, px(-4), py(-4), px(0), py(0), wood, 3);
  line(
    buf,
    w,
    h,
    px(0) + perpX * 5,
    py(0) + perpY * 5,
    px(0) - perpX * 5,
    py(0) - perpY * 5,
    C.outline,
    4
  );
  line(
    buf,
    w,
    h,
    px(0) + perpX * 4.5,
    py(0) + perpY * 4.5,
    px(0) - perpX * 4.5,
    py(0) - perpY * 4.5,
    metalDark,
    3
  );
  line(buf, w, h, px(2), py(2), px(17), py(17), C.outline, 4);
  line(buf, w, h, px(2), py(2), px(16), py(16), metalDark, 3);
  line(buf, w, h, px(3), py(3), px(15), py(15), metal, 2);
  line(buf, w, h, px(5), py(5), px(13), py(13), C.white, 1);
  circle(buf, w, h, px(18), py(18), 1.2, C.white);
}
__name(drawWeapon, "drawWeapon");
function drawFighter(buf, w, h, floorY, cx, face, st, rampColors, weapon) {
  const pose = computePose(st);
  const flash = st.hitFlash;
  const white = flash > 0.62;
  const pick = /* @__PURE__ */ __name((idx) => {
    if (flash > 0.75) return C.white;
    if (flash > 0.3) {
      return idx === rampColors.base || idx === rampColors.light ? C.white : rampColors.lighter;
    }
    return idx;
  }, "pick");
  const base = pick(rampColors.base);
  const dark = pick(rampColors.dark);
  const darker = pick(rampColors.darker);
  const light = pick(rampColors.light);
  const lighter = pick(rampColors.lighter);
  const dx = face * pose.lunge;
  const baseY = floorY;
  const hipY = baseY - FIG.legH + pose.bob + pose.drop;
  const bodyTopY = hipY - FIG.bodyH;
  const neckY = bodyTopY - FIG.neckH;
  const headCy = neckY - FIG.headR - 1.5;
  const shoulderY = bodyTopY + FIG.shoulderFromTop;
  const torX = cx + dx - FIG.bodyW / 2;
  const shadowW = 10 - pose.bob * 0.4 + pose.fall * 4;
  ellipse(buf, w, h, cx + dx * 0.6, baseY - 1, shadowW, 2.4, C.shadow);
  if (pose.fall > 0.72) {
    drawFallen(buf, w, h, floorY, cx + dx, face, colors(base, dark, darker, light), weapon, white);
    return;
  }
  const lean = pose.lean;
  const bodyCx = cx + dx;
  const backHandY = shoulderY + 11;
  line(buf, w, h, bodyCx - face * 3, shoulderY, bodyCx - face * 9, backHandY, C.outline, 5);
  line(buf, w, h, bodyCx - face * 3, shoulderY, bodyCx - face * 9, backHandY, dark, 3);
  oCircle(buf, w, h, bodyCx - face * 9, backHandY, 2, pick(C.skinShade));
  const legTop = hipY;
  const legLen = Math.max(3, baseY - legTop);
  const bootH = 4;
  const drawLeg = /* @__PURE__ */ __name((lx, color, bootColor) => {
    oMirrorRect(buf, w, h, bodyCx, face, lx - 2.5, legTop, 5, legLen - bootH, color);
    oMirrorRect(buf, w, h, bodyCx, face, lx - 3.5, baseY - bootH, 8, bootH, bootColor);
    oMirrorRect(buf, w, h, bodyCx, face, lx - 3.5, baseY - bootH, 8, 1, light);
  }, "drawLeg");
  drawLeg(pose.legBack, darker, dark);
  drawLeg(pose.legFront, dark, base);
  oMirrorRect(buf, w, h, bodyCx, face, -FIG.bodyW / 2 - 0.5, hipY - 4, FIG.bodyW + 1, 6, darker);
  rect(buf, w, h, torX - 1, bodyTopY - 1, FIG.bodyW + 2, FIG.bodyH + 2, C.outline);
  shearRect(buf, w, h, torX, bodyTopY, FIG.bodyW, FIG.bodyH, lean, base);
  shearRect(buf, w, h, torX + 1, bodyTopY + 2, 4, FIG.bodyH - 6, lean * 0.85, light);
  shearRect(buf, w, h, torX + FIG.bodyW - 4, bodyTopY + 3, 3, FIG.bodyH - 7, lean * 1.15, dark);
  shearRect(buf, w, h, torX + 3, bodyTopY, FIG.bodyW - 6, 2, lean, darker);
  shearRect(buf, w, h, torX + 2, bodyTopY + 7, FIG.bodyW - 4, 1, lean, dark);
  shearRect(buf, w, h, torX, bodyTopY + FIG.bodyH - 5, FIG.bodyW, 3, lean, darker);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 2, bodyTopY + FIG.bodyH - 5, 4, 3, C.metalShade);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 2.5, bodyTopY + 9, 5, 5, lighter);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 1, bodyTopY + 10, 2, 3, base);
  oMirrorRect(buf, w, h, bodyCx, face, -7, bodyTopY - 2, 8, 5, darker);
  oMirrorRect(buf, w, h, bodyCx, face, 1, bodyTopY - 3, 8, 5, light);
  oMirrorRect(buf, w, h, bodyCx, face, 1, bodyTopY - 1, 8, 3, base);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 4, neckY - 1, 8, FIG.neckH + 2, C.outline);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 3, neckY, 6, FIG.neckH + 2, C.skinShade);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 3, neckY + 1, 6, 1, C.outline);
  rect(buf, w, h, torX + 1, bodyTopY, FIG.bodyW - 2, 3, C.outline);
  rect(buf, w, h, torX + 2, bodyTopY + 2, FIG.bodyW - 4, 2, darker);
  const headX = bodyCx + face * pose.headTilt;
  circle(buf, w, h, headX, headCy, FIG.headR + 1, C.outline);
  circle(buf, w, h, headX, headCy + 1, FIG.headR, C.skinShade);
  circle(buf, w, h, headX, headCy - 1, FIG.headR - 1, C.skin);
  dome(buf, w, h, headX, headCy - 1.5, FIG.headR + 1, FIG.headR + 1.5, base);
  dome(buf, w, h, headX - 1, headCy - 2, FIG.headR - 1.5, FIG.headR - 0.5, light);
  rect(buf, w, h, headX - 1.5, headCy - FIG.headR - 3, 3, 4, lighter);
  mirrorRect(buf, w, h, headX, face, -FIG.headR - 0.5, headCy - 2, 2.5, 6, dark);
  mirrorRect(buf, w, h, headX, face, 1, headCy - 1, 2.5, 2.5, C.outline);
  mirrorRect(buf, w, h, headX, face, 1.5, headCy + 3, 3, 1, C.outline);
  const shX = bodyCx + face * 4;
  const handX = bodyCx + face * (4 + pose.handX);
  const handY = shoulderY + pose.handY;
  line(buf, w, h, shX, shoulderY, handX, handY, C.outline, 6);
  line(buf, w, h, shX, shoulderY, handX, handY, dark, 4);
  line(buf, w, h, shX, shoulderY - 1, handX, handY - 1, base, 2);
  oCircle(buf, w, h, handX, handY, 2.5, pick(C.skin));
  drawWeapon(buf, w, h, handX, handY, face, pose.weapon, weapon, white);
}
__name(drawFighter, "drawFighter");
function colors(base, dark, darker, light) {
  return { base, dark, darker, light };
}
__name(colors, "colors");
function drawFallen(buf, w, h, floorY, cx, face, cols, weapon, white) {
  const y = floorY - 7;
  const dir = face;
  const bodyX = cx - dir * 3;
  ellipse(buf, w, h, bodyX + dir * 3, floorY - 1, 15, 2.8, C.shadow);
  oRect(buf, w, h, bodyX - 11, y, 22, 7, cols.base);
  rect(buf, w, h, bodyX - 10, y, 20, 2, cols.light);
  rect(buf, w, h, bodyX - 10, y + 5, 20, 2, cols.dark);
  rect(buf, w, h, bodyX - 10, y + 3, 20, 1, cols.darker);
  oRect(buf, w, h, bodyX + dir * 10, y + 1, 9, 5, cols.dark);
  oRect(buf, w, h, bodyX + dir * 17, y + 1, 4, 5, cols.darker);
  const headX = bodyX - dir * 15;
  circle(buf, w, h, headX, y + 2, FIG.headR + 1, C.outline);
  circle(buf, w, h, headX, y + 2, FIG.headR - 1, C.skinShade);
  dome(buf, w, h, headX, y + 1.5, FIG.headR + 0.5, FIG.headR, cols.base);
  line(buf, w, h, bodyX + dir * 2, y + 4, bodyX + dir * 8, floorY - 2, C.outline, 5);
  line(buf, w, h, bodyX + dir * 2, y + 4, bodyX + dir * 8, floorY - 2, cols.darker, 3);
  drawWeapon(buf, w, h, bodyX - dir * 25, floorY - 2, dir, 1.12, weapon, white);
}
__name(drawFallen, "drawFallen");

// src/renderer.js
var FREE_PROFILE = {
  width: 136,
  height: 102,
  fps: 12,
  maxFrames: 36,
  holdAfter: 0.3,
  floorHeight: 17,
  shakeDur: 0.18
};
var NAME_SCALE_MAX = 2;
var NAME_MAX_LINES = 2;
var STARS = [
  [0.06, 0.12],
  [0.14, 0.28],
  [0.21, 0.08],
  [0.29, 0.2],
  [0.36, 0.05],
  [0.44, 0.24],
  [0.51, 0.1],
  [0.58, 0.3],
  [0.66, 0.14],
  [0.73, 0.06],
  [0.8, 0.26],
  [0.87, 0.11],
  [0.93, 0.22],
  [0.97, 0.07],
  [0.11, 0.36],
  [0.4, 0.34],
  [0.62, 0.38],
  [0.83, 0.35]
];
function renderBackground(w, h, floorY, horizon) {
  const buf = new Uint8Array(w * h);
  const bands = [C.sky0, C.sky1, C.sky2, C.sky3];
  for (let i = 0; i < bands.length; i++) {
    const y0 = Math.floor(horizon * i / bands.length);
    const y1 = Math.floor(horizon * (i + 1) / bands.length);
    buf.fill(bands[i], y0 * w, y1 * w);
  }
  for (const [sx, sy] of STARS) {
    const px = Math.round(sx * w);
    const py = Math.round(sy * horizon);
    buf[py * w + px] = C.white;
  }
  const mx = Math.round(w * 0.82);
  const my = Math.round(horizon * 0.24);
  circle(buf, w, h, mx, my, 9, C.sky3);
  circle(buf, w, h, mx, my, 7, C.hpGhost);
  circle(buf, w, h, mx - 2, my - 2, 2, C.sky2);
  circle(buf, w, h, mx + 3, my + 2, 1.5, C.sky2);
  const wallTop = horizon;
  rect(buf, w, h, 0, wallTop, w, floorY - wallTop, C.wall);
  for (let y = wallTop + 6; y < floorY; y += 7) {
    rect(buf, w, h, 0, y, w, 1, C.wallLight);
  }
  for (let y = wallTop + 6, row = 0; y < floorY; y += 7, row++) {
    const off = row % 2 === 0 ? 0 : 9;
    for (let x = off; x < w; x += 18) {
      rect(buf, w, h, x, y, 1, Math.min(7, floorY - y), C.wallLight);
    }
  }
  rect(buf, w, h, 0, wallTop - 4, w, 4, C.wallLight);
  for (let x = 2; x < w; x += 12) {
    rect(buf, w, h, x, wallTop - 8, 7, 5, C.wallLight);
    rect(buf, w, h, x, wallTop - 8, 7, 1, C.sky3);
  }
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
  for (const sx of [0.3, 0.42, 0.58, 0.7]) {
    const gx = Math.round(sx * w);
    rect(buf, w, h, gx - 1, wallTop + 12, 3, 9, C.outline);
    rect(buf, w, h, gx, wallTop + 13, 1, 7, C.sky1);
  }
  for (const tx of [0.11, 0.39, 0.61, 0.89]) {
    const gx = Math.round(tx * w);
    const gy = wallTop + 10;
    rect(buf, w, h, gx, gy, 2, 7, C.woodShade);
    rect(buf, w, h, gx - 2, gy + 7, 6, 2, C.metalShade);
    circle(buf, w, h, gx + 1, gy - 2, 3, C.damage);
    circle(buf, w, h, gx + 1, gy - 3, 1.6, C.spark);
  }
  rect(buf, w, h, 0, floorY, w, h - floorY, C.floor0);
  rect(buf, w, h, 0, floorY, w, 2, C.floorLine);
  rect(buf, w, h, 0, floorY + 2, w, 1, C.floor1);
  for (let i = 0; i < 60; i++) {
    const gx = (i * 37 + 11) % w;
    const gy = floorY + 3 + i * 53 % Math.max(1, h - floorY - 4);
    buf[gy * w + gx] = C.floor1;
  }
  for (const [sx, sy, sw] of [[0.28, 0.55, 9], [0.68, 0.72, 12], [0.48, 0.35, 7]]) {
    const gx = Math.round(sx * w);
    const gy = floorY + Math.round(sy * (h - floorY));
    rect(buf, w, h, gx, gy, sw, 2, C.floor1);
    rect(buf, w, h, gx, gy, sw, 1, C.floorLine);
  }
  return buf;
}
__name(renderBackground, "renderBackground");
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
__name(blit, "blit");
var SPARK_DIRS = [
  [1, 0],
  [0.5, -0.87],
  [-0.5, -0.87],
  [-1, 0],
  [-0.5, 0.87],
  [0.5, 0.87],
  [0.87, -0.5],
  [-0.87, 0.5]
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
__name(drawSparks, "drawSparks");
function drawDust(buf, w, h, cx, floorY, progress) {
  if (progress < 0 || progress > 1) return;
  const spread = 3 + progress * 8;
  const fade = 1 - progress;
  for (let i = 0; i < 6; i++) {
    const ux = i / 5 * 2 - 1;
    const px = Math.round(cx + ux * spread);
    const py = Math.round(floorY - 1 - progress * 4 + i % 2);
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    buf[py * w + px] = fade > 0.4 ? C.dust : C.floorLine;
  }
}
__name(drawDust, "drawDust");
function drawTextOutlined(buf, w, h, str, cx, y, color, scale = 1) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    drawTextCentered(buf, w, h, str, cx + ox, y + oy, C.outline, scale);
  }
  drawTextCentered(buf, w, h, str, cx, y, color, scale);
}
__name(drawTextOutlined, "drawTextOutlined");
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
    let cut = -1;
    for (let i = Math.min(perLine, rest.length - 1); i > Math.max(0, perLine - 5); i--) {
      const ch = rest[i];
      if (ch === " " || ch === "_" || ch === "-" || ch === ".") {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = perLine;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return lines;
}
__name(wrapLabel, "wrapLabel");
function layoutName(name, maxW) {
  const label = String(name || "???").toUpperCase();
  const attempts = [
    [NAME_SCALE_MAX, 1],
    [1, 1],
    [NAME_SCALE_MAX, NAME_MAX_LINES],
    [1, NAME_MAX_LINES]
  ];
  for (const [scale, maxLines] of attempts) {
    const perLine2 = Math.floor((maxW + 1) / (4 * scale));
    const lines2 = wrapLabel(label, perLine2, maxLines);
    if (lines2) return { lines: lines2, scale };
  }
  const perLine = Math.floor((maxW + 1) / 4);
  const lines = wrapLabel(label.slice(0, perLine * NAME_MAX_LINES), perLine, NAME_MAX_LINES);
  return { lines: lines || [label.slice(0, perLine)], scale: 1 };
}
__name(layoutName, "layoutName");
function computeNameplateLayout(name, cx, halfSide, w, isLeft) {
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
__name(computeNameplateLayout, "computeNameplateLayout");
function drawNameplate(buf, w, h, cx, halfSide, st, accent) {
  const isLeft = accent.side === "left";
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
  rect(buf, w, h, plateX, plateTop, plateW, 1, accent.color);
  lines.forEach((line2, i) => {
    const y = nameBottom - (lines.length - i) * lineH - (lines.length - 1 - i) * lineGap;
    drawTextCentered(buf, w, h, line2, plateCx, y, C.white, scale);
  });
  return { barY };
}
__name(drawNameplate, "drawNameplate");
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
    rect(buf, w, h, bx, barY, fillW, 1, frac > 0.5 ? C.hpYellow : C.hpRed);
    rect(buf, w, h, bx, barY + barH - 1, fillW, 1, C.hpFrame);
  }
  for (let i = 1; i < 4; i++) {
    rect(buf, w, h, bx + Math.round(barW * i / 4), barY, 1, barH, C.hpFrame);
  }
  rect(buf, w, h, bx - 1, barY - 1, 1, barH + 2, accent.color);
  rect(buf, w, h, bx + barW, barY - 1, 1, barH + 2, accent.color);
}
__name(drawHealthBar, "drawHealthBar");
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
    y: Math.round(Math.cos(t * 2.4) * mag * 1.1)
  };
}
__name(screenShake, "screenShake");
function renderBattle(request, profile = FREE_PROFILE) {
  const battle = simulateBattle(request);
  const { width, height, fps, floorHeight } = profile;
  const palette = buildPalette(
    hexToRgb(request.left && request.left.color),
    hexToRgb(request.right && request.right.color)
  );
  const timeline = buildTimeline(battle, profile);
  const framesCount = Math.max(2, Math.min(profile.maxFrames, timeline.frames));
  const floorY = height - floorHeight;
  const horizon = Math.max(28, floorY - 50);
  const bg = renderBackground(width, height, floorY, horizon);
  const weapons = {
    left: pickWeapon(battle.fighters.left.name),
    right: pickWeapon(battle.fighters.right.name)
  };
  const cxL = Math.round(width * 0.3);
  const cxR = Math.round(width * 0.7);
  const accents = {
    left: { side: "left", color: C.L_LIGHT },
    right: { side: "right", color: C.R_LIGHT }
  };
  const ramps = {
    left: { base: C.L_BASE, dark: C.L_DARK, darker: C.L_DARKER, light: C.L_LIGHT, lighter: C.L_LIGHTER },
    right: { base: C.R_BASE, dark: C.R_DARK, darker: C.R_DARKER, light: C.R_LIGHT, lighter: C.R_LIGHTER }
  };
  const result = [];
  for (let g = 0; g < framesCount; g++) {
    const simT = timeline.simAt(g / fps);
    result.push(renderFrame({
      width,
      height,
      floorY,
      battle,
      simT,
      bg,
      profile,
      weapons,
      cxL,
      cxR,
      ramps,
      accents
    }));
  }
  return {
    frames: result,
    palette,
    width,
    height,
    delayMs: Math.round(1e3 / fps),
    simSeconds: battle.duration,
    framesCount,
    timeline: {
      gifSeconds: timeline.gifDuration,
      attackScale: timeline.attackScale,
      idleCap: timeline.idleCap,
      beats: timeline.beats,
      totalBeats: timeline.totalBeats,
      segments: timeline.segments,
      simAt: timeline.simAt
    }
  };
}
__name(renderBattle, "renderBattle");
function renderFrame(ctx) {
  const {
    width: w,
    height: h,
    floorY,
    battle,
    simT,
    bg,
    profile,
    weapons,
    cxL,
    cxR,
    ramps,
    accents
  } = ctx;
  const buf = new Uint8Array(w * h);
  const shake = screenShake(battle, simT, profile);
  blit(buf, bg, w, h, shake.x, shake.y);
  const stateL = computeFighterState(battle, "left", simT);
  const stateR = computeFighterState(battle, "right", simT);
  stateL.floorY = floorY;
  stateR.floorY = floorY;
  for (const st of [stateL, stateR]) {
    if (st.mode === "attack" && st.attackP > 0.3 && st.attackP < 0.75) {
      const p = (st.attackP - 0.3) / 0.45;
      const cx = st.side === "left" ? cxL : cxR;
      const dir = st.side === "left" ? 1 : -1;
      drawDust(buf, w, h, cx - dir * 9, floorY, p);
    }
  }
  const drawOrder = stateL.mode === "attack" ? ["right", "left"] : ["left", "right"];
  for (const side of drawOrder) {
    const st = side === "left" ? stateL : stateR;
    const cx = side === "left" ? cxL : cxR;
    const face = side === "left" ? 1 : -1;
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
__name(renderFrame, "renderFrame");
function drawImpactEffects(buf, w, h, battle, simT, floorY, cxL, cxR) {
  for (const ev of impactsNear(battle, simT, 0.3)) {
    const since = simT - ev.t;
    if (since < 0 || since > 0.3) continue;
    const cx = ev.target === "left" ? cxL : cxR;
    const cy = floorY - FIG.legH - FIG.bodyH * 0.6;
    drawSparks(buf, w, h, cx, cy, since / 0.3);
  }
}
__name(drawImpactEffects, "drawImpactEffects");
function drawDamagePopups(buf, w, h, battle, simT, floorY, cxL, cxR) {
  const POPUP_DUR = 0.75;
  const baseY = floorY - FIG.legH - FIG.bodyH - FIG.neckH - FIG.headR * 2 - 4;
  for (const ev of impactsNear(battle, simT, POPUP_DUR)) {
    const since = simT - ev.t;
    if (since < 0 || since > POPUP_DUR) continue;
    const t = since / POPUP_DUR;
    const dir = ev.target === "left" ? 1 : -1;
    const cx = (ev.target === "left" ? cxL : cxR) + dir * 12;
    const y = baseY - Math.round(t * 12);
    const scale = since < 0.09 ? 2 : 1;
    drawTextOutlined(buf, w, h, String(ev.damage), cx, y, C.damage, scale);
  }
}
__name(drawDamagePopups, "drawDamagePopups");

// node_modules/gifenc/dist/gifenc.esm.js
var X = { signature: "GIF", version: "89a", trailer: 59, extensionIntroducer: 33, applicationExtensionLabel: 255, graphicControlExtensionLabel: 249, imageSeparator: 44, signatureSize: 3, versionSize: 3, globalColorTableFlagMask: 128, colorResolutionMask: 112, sortFlagMask: 8, globalColorTableSizeMask: 7, applicationIdentifierSize: 8, applicationAuthCodeSize: 3, disposalMethodMask: 28, userInputFlagMask: 2, transparentColorFlagMask: 1, localColorTableFlagMask: 128, interlaceFlagMask: 64, idSortFlagMask: 32, localColorTableSizeMask: 7 };
function F(t = 256) {
  let e = 0, s = new Uint8Array(t);
  return { get buffer() {
    return s.buffer;
  }, reset() {
    e = 0;
  }, bytesView() {
    return s.subarray(0, e);
  }, bytes() {
    return s.slice(0, e);
  }, writeByte(r) {
    n(e + 1), s[e] = r, e++;
  }, writeBytes(r, o = 0, i = r.length) {
    n(e + i);
    for (let c = 0; c < i; c++) s[e++] = r[c + o];
  }, writeBytesView(r, o = 0, i = r.byteLength) {
    n(e + i), s.set(r.subarray(o, o + i), e), e += i;
  } };
  function n(r) {
    var o = s.length;
    if (o >= r) return;
    var i = 1024 * 1024;
    r = Math.max(r, o * (o < i ? 2 : 1.125) >>> 0), o != 0 && (r = Math.max(r, 256));
    let c = s;
    s = new Uint8Array(r), e > 0 && s.set(c.subarray(0, e), 0);
  }
  __name(n, "n");
}
__name(F, "F");
var O = 12;
var J = 5003;
var lt = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535];
function at(t, e, s, n, r = F(512), o = new Uint8Array(256), i = new Int32Array(J), c = new Int32Array(J)) {
  let x = i.length, a = Math.max(2, n);
  o.fill(0), c.fill(0), i.fill(-1);
  let l = 0, f = 0, g = a + 1, h = g, b = false, w = h, _ = (1 << w) - 1, u = 1 << g - 1, k = u + 1, B = u + 2, p = 0, A = s[0], z = 0;
  for (let y = x; y < 65536; y *= 2) ++z;
  z = 8 - z, r.writeByte(a), I(u);
  let d = s.length;
  for (let y = 1; y < d; y++) {
    t: {
      let m = s[y], v = (m << O) + A, M = m << z ^ A;
      if (i[M] === v) {
        A = c[M];
        break t;
      }
      let V = M === 0 ? 1 : x - M;
      for (; i[M] >= 0; ) if (M -= V, M < 0 && (M += x), i[M] === v) {
        A = c[M];
        break t;
      }
      I(A), A = m, B < 1 << O ? (c[M] = B++, i[M] = v) : (i.fill(-1), B = u + 2, b = true, I(u));
    }
  }
  return I(A), I(k), r.writeByte(0), r.bytesView();
  function I(y) {
    for (l &= lt[f], f > 0 ? l |= y << f : l = y, f += w; f >= 8; ) o[p++] = l & 255, p >= 254 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0), l >>= 8, f -= 8;
    if ((B > _ || b) && (b ? (w = h, _ = (1 << w) - 1, b = false) : (++w, _ = w === O ? 1 << w : (1 << w) - 1)), y == k) {
      for (; f > 0; ) o[p++] = l & 255, p >= 254 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0), l >>= 8, f -= 8;
      p > 0 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0);
    }
  }
  __name(I, "I");
}
__name(at, "at");
var $ = at;
function ct(t = {}) {
  let { initialCapacity: e = 4096, auto: s = true } = t, n = F(e), r = 5003, o = new Uint8Array(256), i = new Int32Array(r), c = new Int32Array(r), x = false;
  return { reset() {
    n.reset(), x = false;
  }, finish() {
    n.writeByte(X.trailer);
  }, bytes() {
    return n.bytes();
  }, bytesView() {
    return n.bytesView();
  }, get buffer() {
    return n.buffer;
  }, get stream() {
    return n;
  }, writeHeader: a, writeFrame(l, f, g, h = {}) {
    let { transparent: b = false, transparentIndex: w = 0, delay: _ = 0, palette: u = null, repeat: k = 0, colorDepth: B = 8, dispose: p = -1 } = h, A = false;
    if (s ? x || (A = true, a(), x = true) : A = Boolean(h.first), f = Math.max(0, Math.floor(f)), g = Math.max(0, Math.floor(g)), A) {
      if (!u) throw new Error("First frame must include a { palette } option");
      pt(n, f, g, u, B), it(n, u), k >= 0 && dt(n, k);
    }
    let z = Math.round(_ / 10);
    wt(n, p, z, b, w);
    let d = Boolean(u) && !A;
    ht(n, f, g, d ? u : null), d && it(n, u), yt(n, l, f, g, B, o, i, c);
  } };
  function a() {
    ft(n, "GIF89a");
  }
  __name(a, "a");
}
__name(ct, "ct");
function wt(t, e, s, n, r) {
  t.writeByte(33), t.writeByte(249), t.writeByte(4), r < 0 && (r = 0, n = false);
  var o, i;
  n ? (o = 1, i = 2) : (o = 0, i = 0), e >= 0 && (i = e & 7), i <<= 2;
  let c = 0;
  t.writeByte(0 | i | c | o), S(t, s), t.writeByte(r || 0), t.writeByte(0);
}
__name(wt, "wt");
function pt(t, e, s, n, r = 8) {
  let o = 1, i = 0, c = Z(n.length) - 1, x = o << 7 | r - 1 << 4 | i << 3 | c, a = 0, l = 0;
  S(t, e), S(t, s), t.writeBytes([x, a, l]);
}
__name(pt, "pt");
function dt(t, e) {
  t.writeByte(33), t.writeByte(255), t.writeByte(11), ft(t, "NETSCAPE2.0"), t.writeByte(3), t.writeByte(1), S(t, e), t.writeByte(0);
}
__name(dt, "dt");
function it(t, e) {
  let s = 1 << Z(e.length);
  for (let n = 0; n < s; n++) {
    let r = [0, 0, 0];
    n < e.length && (r = e[n]), t.writeByte(r[0]), t.writeByte(r[1]), t.writeByte(r[2]);
  }
}
__name(it, "it");
function ht(t, e, s, n) {
  if (t.writeByte(44), S(t, 0), S(t, 0), S(t, e), S(t, s), n) {
    let r = 0, o = 0, i = Z(n.length) - 1;
    t.writeByte(128 | r | o | 0 | i);
  } else t.writeByte(0);
}
__name(ht, "ht");
function yt(t, e, s, n, r = 8, o, i, c) {
  $(s, n, e, r, t, o, i, c);
}
__name(yt, "yt");
function S(t, e) {
  t.writeByte(e & 255), t.writeByte(e >> 8 & 255);
}
__name(S, "S");
function ft(t, e) {
  for (var s = 0; s < e.length; s++) t.writeByte(e.charCodeAt(s));
}
__name(ft, "ft");
function Z(t) {
  return Math.max(Math.ceil(Math.log2(t)), 1);
}
__name(Z, "Z");

// src/gif.js
var patchScratch = null;
var STREAM_CAPACITY = 64 * 1024;
function encodeGif(frames, width, height, palette, delayMs, opts = {}) {
  const useDelta = opts.delta !== false && frames.length > 1;
  const gif = ct({ initialCapacity: STREAM_CAPACITY });
  const transparentIndex = palette.length;
  const pal = useDelta ? [...palette, [255, 0, 255]] : palette;
  let colorDepth = 2;
  while (1 << colorDepth < pal.length) colorDepth++;
  const size = width * height;
  let patch = null;
  if (useDelta) {
    if (!patchScratch || patchScratch.length < size) patchScratch = new Uint8Array(size);
    patch = patchScratch;
  }
  let prev = null;
  frames.forEach((frame, i) => {
    let data2 = frame;
    if (useDelta) {
      if (i === 0) {
        data2 = frame;
      } else {
        for (let p = 0; p < frame.length; p++) {
          patch[p] = frame[p] === prev[p] ? transparentIndex : frame[p];
        }
        data2 = patch;
      }
      prev = frame;
    }
    gif.writeFrame(data2, width, height, {
      palette: i === 0 ? pal : void 0,
      delay: delayMs,
      repeat: i === 0 ? 0 : -1,
      transparent: useDelta && i > 0,
      transparentIndex,
      dispose: useDelta ? 1 : -1,
      colorDepth
    });
  });
  gif.finish();
  return gif.bytesView();
}
__name(encodeGif, "encodeGif");

// src/telegram.js
var API = "https://api.telegram.org";
function createTelegram(env) {
  const token = env.BOT_TOKEN;
  const botPath = /* @__PURE__ */ __name((method) => `${API}/bot${token}/${method}`, "botPath");
  async function json(method, payload) {
    const res = await fetch(botPath(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  __name(json, "json");
  async function multipart(method, fields) {
    const fd = new FormData();
    for (const [key, value, name] of fields) {
      if (name) fd.append(key, value, name);
      else fd.append(key, value);
    }
    const res = await fetch(botPath(method), { method: "POST", body: fd });
    return res.json();
  }
  __name(multipart, "multipart");
  return {
    async setMyCommands(commands) {
      return json("setMyCommands", { commands });
    },
    async sendMessage(chatId, text, opts = {}) {
      return json("sendMessage", { chat_id: chatId, text, ...opts });
    },
    async editMessageText(chatId, messageId, text, opts = {}) {
      return json("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: { inline_keyboard: [] },
        ...opts
      });
    },
    async deleteMessage(chatId, messageId) {
      return json("deleteMessage", { chat_id: chatId, message_id: messageId });
    },
    async answerCallbackQuery(callbackQueryId, text = "") {
      const payload = { callback_query_id: callbackQueryId };
      if (text) payload.text = text;
      return json("answerCallbackQuery", payload);
    },
    async sendAnimation(chatId, bytes, caption) {
      return multipart("sendAnimation", [
        ["chat_id", String(chatId)],
        ["animation", new Blob([bytes], { type: "image/gif" }), "fight.gif"],
        ["caption", caption]
      ]);
    }
  };
}
__name(createTelegram, "createTelegram");

// src/arena.js
var ARENA_TTL = 600;
var MENU_TTL = 60 * 60 * 24 * 30;
var data = /* @__PURE__ */ new Map();
var menuSent = /* @__PURE__ */ new Set();
function arenaKey(chatId) {
  return `arena:${chatId}`;
}
__name(arenaKey, "arenaKey");
function menuKey(chatId) {
  return `menu:${chatId}`;
}
__name(menuKey, "menuKey");
function isFresh(arena) {
  return arena && Date.now() - arena.createdAt < ARENA_TTL * 1e3;
}
__name(isFresh, "isFresh");
async function loadArena(env, chatId) {
  if (env.ARENAS) {
    try {
      const v2 = await env.ARENAS.get(arenaKey(chatId), "json");
      return isFresh(v2) ? v2 : null;
    } catch {
      return null;
    }
  }
  const v = data.get(String(chatId));
  return isFresh(v) ? v : null;
}
__name(loadArena, "loadArena");
async function saveArena(env, chatId, arena) {
  if (env.ARENAS) {
    await env.ARENAS.put(arenaKey(chatId), JSON.stringify(arena), { expirationTtl: ARENA_TTL });
  } else {
    data.set(String(chatId), arena);
  }
}
__name(saveArena, "saveArena");
async function deleteArena(env, chatId) {
  if (env.ARENAS) {
    await env.ARENAS.delete(arenaKey(chatId));
  } else {
    data.delete(String(chatId));
  }
}
__name(deleteArena, "deleteArena");
async function cancelArenas(env, chatId) {
  const arena = await loadArena(env, chatId);
  if (!arena) return [];
  await deleteArena(env, chatId);
  return [arena];
}
__name(cancelArenas, "cancelArenas");
async function loadMenu(env, chatId) {
  if (env.ARENAS) {
    try {
      return await env.ARENAS.get(menuKey(chatId), "json");
    } catch {
      return null;
    }
  }
  return menuSent.has(String(chatId)) ? { sentAt: 0 } : null;
}
__name(loadMenu, "loadMenu");
async function saveMenu(env, chatId) {
  const value = { sentAt: Date.now() };
  if (env.ARENAS) {
    await env.ARENAS.put(menuKey(chatId), JSON.stringify(value), { expirationTtl: MENU_TTL });
  } else {
    menuSent.add(String(chatId));
  }
  return value;
}
__name(saveMenu, "saveMenu");
function randId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randId, "randId");

// src/index.js
var COLORS = ["#ff9b3d", "#4da6ff", "#e74c3c", "#2ecc71", "#9b59b6", "#f1c40f", "#1abc9c", "#e67e22"];
var BOT_COMMANDS = [
  { command: "arena", description: "\u0412\u044B\u0439\u0442\u0438 \u043D\u0430 \u0430\u0440\u0435\u043D\u0443" },
  { command: "stop", description: "\u041E\u0444\u043D\u0443\u0442\u044C \u0432\u0441\u0435 \u0430\u0440\u0435\u043D\u044B \u0432 \u0447\u0430\u0442\u0435" }
];
var ARENA_BUTTON = "\u2694\uFE0F \u0412\u044B\u0439\u0442\u0438 \u043D\u0430 \u0430\u0440\u0435\u043D\u0443";
var MENU_HINT = "\u2694\uFE0F \u041A\u043D\u043E\u043F\u043A\u0430 \xAB\u0412\u044B\u0439\u0442\u0438 \u043D\u0430 \u0430\u0440\u0435\u043D\u0443\xBB \u0442\u0435\u043F\u0435\u0440\u044C \u0432\u0441\u0435\u0433\u0434\u0430 \u0432\u043D\u0438\u0437\u0443 \u{1F447}";
function displayName(from) {
  if (!from) return "\u0411\u043E\u0435\u0446";
  return from.username || from.first_name || "\u0411\u043E\u0435\u0446";
}
__name(displayName, "displayName");
function shortName(name) {
  return name.length > 20 ? `${name.slice(0, 19)}\u2026` : name;
}
__name(shortName, "shortName");
function colorFor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
  return COLORS[h % COLORS.length];
}
__name(colorFor, "colorFor");
function rollStats(from) {
  const id = from && from.id !== void 0 ? from.id : 0;
  const rand = mulberry32(id ^ Date.now());
  return {
    hp: 80 + Math.floor(rand() * 101),
    // 80..180
    attackPower: 6 + Math.floor(rand() * 21),
    // 6..26
    attackSpeed: Math.round((0.6 + rand() * 1.2) * 10) / 10
    // 0.6..1.8
  };
}
__name(rollStats, "rollStats");
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a += 1831565813;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
__name(mulberry32, "mulberry32");
var NOT_WORD = /[^a-z0-9а-яё@]+/g;
function normalizeText(text) {
  return String(text == null ? "" : text).toLowerCase().replace(NOT_WORD, " ").split(" ").filter(Boolean).join(" ");
}
__name(normalizeText, "normalizeText");
var ARENA_WORDS = ["arena", "\u0430\u0440\u0435\u043D\u0430"];
var STOP_WORDS = ["stop", "\u0441\u0442\u043E\u043F"];
var BUTTON_WORD = normalizeText(ARENA_BUTTON);
function matchesWords(t, words) {
  if (!t) return false;
  if (words.includes(t)) return true;
  return words.some((w) => t.startsWith(`${w}@`));
}
__name(matchesWords, "matchesWords");
function isArenaCommand(text) {
  const t = normalizeText(text);
  return t === BUTTON_WORD || matchesWords(t, ARENA_WORDS);
}
__name(isArenaCommand, "isArenaCommand");
function isStopCommand(text) {
  return matchesWords(normalizeText(text), STOP_WORDS);
}
__name(isStopCommand, "isStopCommand");
function arenaText(arena) {
  const f = arena.left;
  return [
    "\u2694\uFE0F \u0410\u0420\u0415\u041D\u0410 \u0421\u041E\u0417\u0414\u0410\u041D\u0410",
    "",
    `\u{1F94A} ${f.name} \u0432\u044B\u0437\u044B\u0432\u0430\u0435\u0442 \u043D\u0430 \u0431\u043E\u0439!`,
    "",
    `\u2764\uFE0F HP: ${f.hp}   \u26A1 \u0421\u0438\u043B\u0430: ${f.attackPower}   \u{1F3C3} \u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C: ${f.attackSpeed}`,
    "",
    "\u041F\u0440\u0438\u043D\u0438\u043C\u0430\u0439 \u0432\u044B\u0437\u043E\u0432 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u043D\u0438\u0436\u0435 \u{1F447}"
  ].join("\n");
}
__name(arenaText, "arenaText");
function fightAnnounce(arena) {
  const l = arena.left;
  const r = arena.right;
  return [
    "\u{1F525} \u0418\u0414\u0401\u0422 \u0411\u041E\u0419!",
    "",
    `\u{1F94A} ${l.name}`,
    `\u2764\uFE0F ${l.hp}  \u26A1 ${l.attackPower}  \u{1F3C3} ${l.attackSpeed}`,
    "        \u2694\uFE0F vs",
    `\u{1F94A} ${r.name}`,
    `\u2764\uFE0F ${r.hp}  \u26A1 ${r.attackPower}  \u{1F3C3} ${r.attackSpeed}`
  ].join("\n");
}
__name(fightAnnounce, "fightAnnounce");
function offAllText(from) {
  return [
    "\u{1F6D1} \u0410\u0420\u0415\u041D\u042B \u0417\u0410\u041A\u0420\u042B\u0422\u042B",
    "",
    `\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B: ${displayName(from)}`,
    "",
    "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C /arena \u2014 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u043E\u0432\u0443\u044E."
  ].join("\n");
}
__name(offAllText, "offAllText");
function arenaCard(arena) {
  return {
    inline_keyboard: [
      [
        {
          text: `\u2694\uFE0F \u0412\u044B\u0439\u0442\u0438 \u043F\u0440\u043E\u0442\u0438\u0432 ${shortName(arena.left.name)}`,
          callback_data: `a|${arena.chatId}|${arena.id}`,
          style: "success"
        }
      ]
    ]
  };
}
__name(arenaCard, "arenaCard");
function arenaKeyboard() {
  return {
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "\u041A\u043D\u043E\u043F\u043A\u0438 \u0438\u043B\u0438 /arena",
    keyboard: [[{ text: ARENA_BUTTON, style: "primary" }]]
  };
}
__name(arenaKeyboard, "arenaKeyboard");
function parseCallback(data2) {
  const parts = String(data2).split("|");
  if (parts.length !== 3 || parts[0] !== "a") return null;
  const chatId = Number(parts[1]);
  if (!Number.isInteger(chatId)) return null;
  return { chatId, arenaId: parts[2] };
}
__name(parseCallback, "parseCallback");
function parseOffAll(data2) {
  const parts = String(data2).split("|");
  if (parts.length !== 2 || parts[0] !== "o") return null;
  const chatId = Number(parts[1]);
  if (!Number.isInteger(chatId)) return null;
  return { chatId };
}
__name(parseOffAll, "parseOffAll");
async function processFight(env, chatId, messageId, left, right) {
  const bot = createTelegram(env);
  const req = { left, right };
  const battle = simulateBattle(req);
  const rendered = renderBattle(req);
  const gif = encodeGif(rendered.frames, rendered.width, rendered.height, rendered.palette, rendered.delayMs);
  await bot.deleteMessage(chatId, messageId).catch(() => {
  });
  const caption = [`\u2694\uFE0F ${left.name} vs ${right.name}`, battleResultText(battle)].join("\n");
  await bot.sendAnimation(chatId, gif, caption);
}
__name(processFight, "processFight");
var commandsSynced = false;
function syncCommands(bot) {
  if (commandsSynced) return null;
  commandsSynced = true;
  return bot.setMyCommands(BOT_COMMANDS).catch(() => {
  });
}
__name(syncCommands, "syncCommands");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }
    if (request.method === "POST" && url.pathname === "/hook") {
      return handleWebhook(request, env, ctx);
    }
    if (request.method === "POST" && url.pathname === "/render") {
      return handleRender(request, env);
    }
    return new Response("not found", { status: 404 });
  }
};
async function handleWebhook(request, env, ctx) {
  if (env.WEBHOOK_SECRET && request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const canDefer = ctx && typeof ctx.waitUntil === "function";
  const sync = syncCommands(createTelegram(env));
  if (sync && canDefer) ctx.waitUntil(sync);
  if (update.message && update.message.text) {
    await handleMessage(env, update);
  } else if (update.callback_query) {
    const job = handleCallback(env, update);
    if (canDefer) ctx.waitUntil(job);
    else await job;
  }
  return new Response("ok");
}
__name(handleWebhook, "handleWebhook");
async function handleMessage(env, update) {
  const bot = createTelegram(env);
  const msg = update.message;
  const text = msg.text || "";
  const chatId = msg.chat.id;
  if (isStopCommand(text)) return handleStop(env, bot, msg);
  if (!isArenaCommand(text)) return;
  if (msg.chat.type === "private") {
    await bot.sendMessage(chatId, "\u2694\uFE0F \u041A\u043E\u043C\u0430\u043D\u0434\u0430 /arena \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0433\u0440\u0443\u043F\u043F\u043E\u0432\u044B\u0445 \u0447\u0430\u0442\u0430\u0445.");
    return;
  }
  const from = msg.from;
  const existing = await loadArena(env, chatId);
  if (existing) {
    await bot.sendMessage(chatId, "\u2694\uFE0F \u0412 \u044D\u0442\u043E\u043C \u0447\u0430\u0442\u0435 \u0443\u0436\u0435 \u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0431\u043E\u0439. \u041F\u0440\u0438\u043C\u0438 \u0432\u044B\u0437\u043E\u0432 \u0438\u043B\u0438 \u043F\u043E\u0434\u043E\u0436\u0434\u0438.");
    return;
  }
  const arena = {
    id: randId(),
    chatId,
    creatorId: from.id,
    creatorName: displayName(from),
    createdAt: Date.now(),
    left: {
      name: displayName(from),
      ...rollStats(from),
      color: colorFor(from.id)
    },
    right: null
  };
  const resp = await bot.sendMessage(chatId, arenaText(arena), { reply_markup: arenaCard(arena) });
  if (resp && resp.ok && resp.result) arena.messageId = resp.result.message_id;
  await saveArena(env, chatId, arena);
  if (!await loadMenu(env, chatId)) {
    const sent = await bot.sendMessage(chatId, MENU_HINT, { reply_markup: arenaKeyboard() }).catch(() => null);
    if (sent && sent.ok) await saveMenu(env, chatId);
  }
}
__name(handleMessage, "handleMessage");
async function closeArenas(env, bot, chatId, from, fallbackMessageId) {
  const cancelled = await cancelArenas(env, chatId);
  if (cancelled.length === 0) return null;
  const arena = cancelled[0];
  const messageId = arena.messageId || fallbackMessageId;
  if (messageId) {
    await bot.editMessageText(chatId, messageId, offAllText(from)).catch(() => {
    });
  }
  return arena;
}
__name(closeArenas, "closeArenas");
async function handleStop(env, bot, msg) {
  const chatId = msg.chat.id;
  if (msg.chat.type === "private") {
    await bot.sendMessage(chatId, "\u2694\uFE0F \u041A\u043E\u043C\u0430\u043D\u0434\u0430 /stop \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0433\u0440\u0443\u043F\u043F\u043E\u0432\u044B\u0445 \u0447\u0430\u0442\u0430\u0445.");
    return;
  }
  const closed = await closeArenas(env, bot, chatId, msg.from);
  await bot.sendMessage(
    chatId,
    closed ? "\u{1F6D1} \u0410\u0440\u0435\u043D\u044B \u0432 \u044D\u0442\u043E\u043C \u0447\u0430\u0442\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u044B." : "\u0412 \u044D\u0442\u043E\u043C \u0447\u0430\u0442\u0435 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0430\u0440\u0435\u043D."
  ).catch(() => {
  });
}
__name(handleStop, "handleStop");
async function handleCallback(env, update) {
  const bot = createTelegram(env);
  const cq = update.callback_query;
  const off = parseOffAll(cq.data);
  if (off) return handleOffAll(bot, env, cq, off.chatId);
  const parsed = parseCallback(cq.data);
  if (!parsed) {
    await bot.answerCallbackQuery(cq.id, "\u0421\u043B\u043E\u043C\u0430\u043D\u043D\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430 \u{1F914}");
    return;
  }
  const { chatId, arenaId } = parsed;
  const fromId = cq.from.id;
  const existing = await loadArena(env, chatId);
  if (!existing || existing.id !== arenaId) {
    await bot.answerCallbackQuery(cq.id, "\u042D\u0442\u0430 \u0430\u0440\u0435\u043D\u0430 \u0443\u0436\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0430");
    return;
  }
  if (existing.creatorId === fromId) {
    await bot.answerCallbackQuery(cq.id, "\u042D\u0442\u043E \u0442\u0432\u043E\u0439 \u0432\u044B\u0437\u043E\u0432 \u2014 \u0436\u0434\u0438 \u0441\u043E\u043F\u0435\u0440\u043D\u0438\u043A\u0430!");
    return;
  }
  const right = {
    name: displayName(cq.from),
    ...rollStats(cq.from),
    color: colorFor(fromId)
  };
  existing.right = right;
  await deleteArena(env, chatId);
  await bot.answerCallbackQuery(cq.id, "\u0411\u043E\u0439 \u043F\u0440\u0438\u043D\u044F\u0442! \u{1F525}");
  await bot.editMessageText(chatId, existing.messageId, fightAnnounce(existing));
  return processFight(env, chatId, existing.messageId, existing.left, existing.right);
}
__name(handleCallback, "handleCallback");
async function handleOffAll(bot, env, cq, chatId) {
  const msgChatId = cq.message && cq.message.chat ? cq.message.chat.id : chatId;
  if (msgChatId !== chatId) {
    await bot.answerCallbackQuery(cq.id, "\u0421\u043B\u043E\u043C\u0430\u043D\u043D\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430 \u{1F914}");
    return;
  }
  const fallback = cq.message && cq.message.message_id;
  const closed = await closeArenas(env, bot, chatId, cq.from, fallback);
  await bot.answerCallbackQuery(cq.id, closed ? "\u0410\u0440\u0435\u043D\u044B \u0437\u0430\u043A\u0440\u044B\u0442\u044B \u{1F6D1}" : "\u0412 \u044D\u0442\u043E\u043C \u0447\u0430\u0442\u0435 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0430\u0440\u0435\u043D");
}
__name(handleOffAll, "handleOffAll");
async function handleRender(request, env) {
  if (env.RENDER_KEY && request.headers.get("x-render-key") !== env.RENDER_KEY) {
    return new Response("unauthorized", { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  try {
    const rendered = renderBattle(body);
    const gif = encodeGif(rendered.frames, rendered.width, rendered.height, rendered.palette, rendered.delayMs);
    return new Response(gif, {
      headers: {
        "content-type": "image/gif",
        "cache-control": "no-store"
      }
    });
  } catch (err) {
    return new Response(`render error: ${err.message}`, { status: 400 });
  }
}
__name(handleRender, "handleRender");
var internals = {
  handleWebhook,
  handleMessage,
  handleCallback,
  handleStop,
  handleOffAll,
  closeArenas,
  processFight,
  parseCallback,
  parseOffAll,
  isArenaCommand,
  isStopCommand,
  normalizeText,
  displayName,
  rollStats,
  arenaKeyboard,
  arenaCard,
  BOT_COMMANDS,
  ARENA_BUTTON,
  MENU_HINT
};
export {
  index_default as default,
  internals
};
//# sourceMappingURL=index.js.map
