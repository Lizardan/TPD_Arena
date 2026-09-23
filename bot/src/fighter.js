/**
 * Fighter sprite: anatomy, pose solver and weapon rendering.
 *
 * The fighter is drawn part by part (back arm, legs, torso, neck, head, front
 * arm + weapon) instead of the old "capsule + circle" blob, which gives real
 * silhouettes at this resolution: separate legs with boots, a waist, a chest
 * plate, pauldrons, a neck, a helmet with a crest, a face and a visible weapon.
 *
 * Every part is stroked twice - first one pixel larger in the outline colour,
 * then in its own colour - so the silhouette stays crisp against the arena.
 *
 * Animation is a small state machine:
 *   dead  >  attack (windup -> strike -> recover)  >  hurt  >  idle
 */

import { C } from './palette.js';
import {
  rect, circle, ellipse, dome, line, triangle, mirrorRect, shearRect,
} from './draw.js';
import { attackAnimDuration } from './timeline.js';

/** Body proportions in pixels (scene is 136x102). */
export const FIG = {
  legH: 18,
  bodyH: 20,
  bodyW: 15,
  headR: 5,
  neckH: 4,
  shoulderFromTop: 4,
};

export const HURT_DUR = 0.26;
export const DEATH_DUR = 0.7;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t) => t * t;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

/* Stroked primitives: outline first, then the fill on top. */
const oRect = (buf, w, h, x, y, rw, rh, color) => {
  rect(buf, w, h, x - 1, y - 1, rw + 2, rh + 2, C.outline);
  rect(buf, w, h, x, y, rw, rh, color);
};

const oMirrorRect = (buf, w, h, cx, face, lx, y, rw, rh, color) => {
  mirrorRect(buf, w, h, cx, face, lx - 1, y - 1, rw + 2, rh + 2, C.outline);
  mirrorRect(buf, w, h, cx, face, lx, y, rw, rh, color);
};

const oCircle = (buf, w, h, cx, cy, r, color) => {
  circle(buf, w, h, cx, cy, r + 1, C.outline);
  circle(buf, w, h, cx, cy, r, color);
};

/* ------------------------------------------------------------------ */
/* Weapon selection                                                    */
/* ------------------------------------------------------------------ */

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WEAPONS = ['sword', 'mace', 'spear'];

/** Deterministic weapon per nickname so a fighter always looks the same. */
export function pickWeapon(name) {
  return WEAPONS[hashStr(String(name || '?')) % WEAPONS.length];
}

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Event index                                                         */
/* ------------------------------------------------------------------ */

/**
 * Per-battle index of the events the renderer queries per frame.
 *
 * The state machine used to walk the whole event list on every call, which is
 * fine for a 20-event duel but quadratic in disguise for a 60 s brawl with a
 * thousand swings: the render cost grew with the *simulation*, not with the
 * number of frames actually drawn. Indexing by side and binary-searching keeps
 * a frame's cost proportional to log(events).
 *
 * Cached in a WeakMap so the public computeFighterState(battle, side, simT)
 * signature stays intact and nothing is added to the battle object.
 */
const EVENT_INDEX = new WeakMap();

function eventIndex(battle) {
  let idx = EVENT_INDEX.get(battle);
  if (idx) return idx;

  const mkSide = () => ({ attacks: [], impacts: [], deathT: -1 });
  idx = { left: mkSide(), right: mkSide(), impacts: [] };

  for (const ev of battle.events) {
    if (ev.type === 'attack') {
      idx[ev.who].attacks.push(ev.t);
    } else if (ev.type === 'impact') {
      const rec = { t: ev.t, hpAfter: ev.hpAfter, target: ev.target, damage: ev.damage };
      idx[ev.target].impacts.push(rec);
      idx.impacts.push(rec);
    } else if (ev.type === 'death') {
      idx[ev.who].deathT = ev.t;
    }
  }
  EVENT_INDEX.set(battle, idx);
  return idx;
}

/** Index of the last entry with t <= limit, or -1. Arrays are time-sorted. */
function lastIndexAtOrBefore(arr, limit) {
  let lo = 0;
  let hi = arr.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= limit) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Same, for a plain array of timestamps. */
function lastTimeAtOrBefore(times, limit) {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= limit) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Impact records close to `simT`, for the effects layer. */
export function impactsNear(battle, simT, window) {
  const all = eventIndex(battle).impacts;
  const end = lastIndexAtOrBefore(all, simT);
  const out = [];
  for (let i = end; i >= 0; i--) {
    if (simT - all[i].t > window) break;
    out.push(all[i]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

export function computeFighterState(battle, side, simT) {
  const fighter = battle.fighters[side];
  const st = {
    side,
    name: fighter.name,
    hp: fighter.hp,
    maxHp: fighter.hp,
    ghostHp: fighter.hp,
    mode: 'idle',
    attackP: 0,
    attackAnim: attackAnimDuration(fighter.attackSpeed),
    hitFlash: 0,
    hurtP: 0,
    deadP: 0,
    dead: false,
    simT,
    lastAttackT: -1,
    lastHitT: -1,
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

  // The index stores the death time unconditionally, so it must still be
  // filtered by simT - otherwise every frame before the killing blow would
  // render the fighter as already dead.
  const deathT = idx.deathT >= 0 && simT >= idx.deathT ? idx.deathT : -1;

  // Ghost bar: HP a moment ago, shown as a white trailing chunk.
  const ghostIdx = lastIndexAtOrBefore(idx.impacts, simT - 0.35);
  if (ghostIdx >= 0) st.ghostHp = idx.impacts[ghostIdx].hpAfter;

  if (deathT >= 0) {
    st.dead = true;
    st.mode = 'dead';
    st.deadP = clamp01((simT - deathT) / DEATH_DUR);
    st.deadT = deathT;
  } else if (attackT >= 0 && simT - attackT < attackDur) {
    st.mode = 'attack';
    st.attackP = clamp01((simT - attackT) / attackDur);
    st.attackAnim = attackDur;
  } else if (hitT >= 0 && simT - hitT < HURT_DUR) {
    st.mode = 'hurt';
    st.hurtP = clamp01((simT - hitT) / HURT_DUR);
  }

  st.lastAttackT = attackT;
  st.lastHitT = hitT;

  if (hitT >= 0) {
    const since = simT - hitT;
    // Short flash: long enough to read the hit, short enough not to erase the
    // silhouette for several frames.
    if (since < 0.13) st.hitFlash = 1 - since / 0.13;
  }

  return st;
}

/* ------------------------------------------------------------------ */
/* Pose solver                                                         */
/* ------------------------------------------------------------------ */

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
    backArm: -0.5,
  };
}

function idlePose(st) {
  const pose = basePose();
  // Breathing plus a slower weight shift on a different period, so the idle
  // never reads as a two-frame flicker.
  const p = (st.simT * 0.8) % 1;
  const q = (st.simT * 0.37) % 1;
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

export function computePose(st) {
  if (st.mode === 'dead') return deadPose(st);
  if (st.mode === 'attack') return attackPose(st);
  if (st.mode === 'hurt') return hurtPose(st);
  return idlePose(st);
}

/* ------------------------------------------------------------------ */
/* Weapon drawing                                                      */
/* ------------------------------------------------------------------ */

/**
 * Draws the weapon held at (hx, hy) in world coordinates.
 * `angle` is measured from "pointing down" towards the facing direction.
 */
function drawWeapon(buf, w, h, hx, hy, face, angle, type, white) {
  const dirX = face * Math.sin(angle);
  const dirY = Math.cos(angle);
  const px = (d) => hx + dirX * d;
  const py = (d) => hy + dirY * d;
  const perpX = -dirY * face;
  const perpY = dirX * face;

  const metal = white ? C.white : C.metal;
  const metalDark = white ? C.white : C.metalShade;
  const wood = white ? C.white : C.wood;
  const woodDark = white ? C.white : C.woodShade;

  if (type === 'mace') {
    // Shaft.
    line(buf, w, h, px(-5), py(-5), px(12), py(12), C.outline, 4);
    line(buf, w, h, px(-5), py(-5), px(12), py(12), woodDark, 3);
    line(buf, w, h, px(-5), py(-5), px(12), py(12), wood, 1);
    // Spiked head: a ball with four spikes, outlined so it reads at any angle.
    const hx2 = px(15);
    const hy2 = py(15);
    circle(buf, w, h, hx2, hy2, 5.5, C.outline);
    circle(buf, w, h, hx2, hy2, 4.2, metalDark);
    circle(buf, w, h, hx2 - 1, hy2 - 1, 2.4, metal);
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Spikes in world axes so the head looks studded from any swing angle.
      triangle(buf, w, h,
        hx2 + ax * 8, hy2 + ay * 8,
        hx2 + ax * 3.5 + ay * 2.4, hy2 + ay * 3.5 + ax * 2.4,
        hx2 + ax * 3.5 - ay * 2.4, hy2 + ay * 3.5 - ax * 2.4,
        metal);
    }
    return;
  }

  if (type === 'spear') {
    line(buf, w, h, px(-7), py(-7), px(17), py(17), C.outline, 4);
    line(buf, w, h, px(-7), py(-7), px(17), py(17), woodDark, 3);
    line(buf, w, h, px(-7), py(-7), px(17), py(17), wood, 1);
    triangle(buf, w, h,
      px(23), py(23),
      px(16) + perpX * 3, py(16) + perpY * 3,
      px(16) - perpX * 3, py(16) - perpY * 3,
      metal);
    triangle(buf, w, h,
      px(23), py(23),
      px(18) + perpX * 1.4, py(18) + perpY * 1.4,
      px(18) - perpX * 1.4, py(18) - perpY * 1.4,
      metalDark);
    return;
  }

  // Sword: pommel, grip, crossguard, blade with a fuller and a bright tip.
  line(buf, w, h, px(-4), py(-4), px(0), py(0), C.outline, 4);
  line(buf, w, h, px(-4), py(-4), px(0), py(0), wood, 3);
  line(buf, w, h,
    px(0) + perpX * 5, py(0) + perpY * 5,
    px(0) - perpX * 5, py(0) - perpY * 5,
    C.outline, 4);
  line(buf, w, h,
    px(0) + perpX * 4.5, py(0) + perpY * 4.5,
    px(0) - perpX * 4.5, py(0) - perpY * 4.5,
    metalDark, 3);
  line(buf, w, h, px(2), py(2), px(17), py(17), C.outline, 4);
  line(buf, w, h, px(2), py(2), px(16), py(16), metalDark, 3);
  line(buf, w, h, px(3), py(3), px(15), py(15), metal, 2);
  line(buf, w, h, px(5), py(5), px(13), py(13), C.white, 1);
  circle(buf, w, h, px(18), py(18), 1.2, C.white);
}

/* ------------------------------------------------------------------ */
/* Fighter drawing                                                     */
/* ------------------------------------------------------------------ */

export function drawFighter(buf, w, h, floorY, cx, face, st, rampColors, weapon) {
  const pose = computePose(st);
  const flash = st.hitFlash;
  const white = flash > 0.62;

  const pick = (idx) => {
    if (flash > 0.75) return C.white;
    if (flash > 0.3) {
      return idx === rampColors.base || idx === rampColors.light
        ? C.white
        : rampColors.lighter;
    }
    return idx;
  };

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

  /* --- Back arm (behind everything) --- */
  const backHandY = shoulderY + 11;
  line(buf, w, h, bodyCx - face * 3, shoulderY, bodyCx - face * 9, backHandY, C.outline, 5);
  line(buf, w, h, bodyCx - face * 3, shoulderY, bodyCx - face * 9, backHandY, dark, 3);
  oCircle(buf, w, h, bodyCx - face * 9, backHandY, 2, pick(C.skinShade));

  /* --- Legs: back leg, then front leg, with a visible gap between them --- */
  const legTop = hipY;
  const legLen = Math.max(3, baseY - legTop);
  const bootH = 4;

  const drawLeg = (lx, color, bootColor) => {
    // Thigh + shin.
    oMirrorRect(buf, w, h, bodyCx, face, lx - 2.5, legTop, 5, legLen - bootH, color);
    // Boot, pointing towards the facing direction.
    oMirrorRect(buf, w, h, bodyCx, face, lx - 3.5, baseY - bootH, 8, bootH, bootColor);
    oMirrorRect(buf, w, h, bodyCx, face, lx - 3.5, baseY - bootH, 8, 1, light);
  };

  drawLeg(pose.legBack, darker, dark);
  drawLeg(pose.legFront, dark, base);

  /* --- Waist / hips --- */
  oMirrorRect(buf, w, h, bodyCx, face, -FIG.bodyW / 2 - 0.5, hipY - 4, FIG.bodyW + 1, 6, darker);

  /* --- Torso --- */
  rect(buf, w, h, torX - 1, bodyTopY - 1, FIG.bodyW + 2, FIG.bodyH + 2, C.outline);
  shearRect(buf, w, h, torX, bodyTopY, FIG.bodyW, FIG.bodyH, lean, base);
  shearRect(buf, w, h, torX + 1, bodyTopY + 2, 4, FIG.bodyH - 6, lean * 0.85, light);
  shearRect(buf, w, h, torX + FIG.bodyW - 4, bodyTopY + 3, 3, FIG.bodyH - 7, lean * 1.15, dark);
  // Collar, chest plate seam and belt.
  shearRect(buf, w, h, torX + 3, bodyTopY, FIG.bodyW - 6, 2, lean, darker);
  shearRect(buf, w, h, torX + 2, bodyTopY + 7, FIG.bodyW - 4, 1, lean, dark);
  shearRect(buf, w, h, torX, bodyTopY + FIG.bodyH - 5, FIG.bodyW, 3, lean, darker);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 2, bodyTopY + FIG.bodyH - 5, 4, 3, C.metalShade);
  // Chest emblem.
  rect(buf, w, h, torX + FIG.bodyW / 2 - 2.5, bodyTopY + 9, 5, 5, lighter);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 1, bodyTopY + 10, 2, 3, base);

  /* --- Pauldrons --- */
  oMirrorRect(buf, w, h, bodyCx, face, -7, bodyTopY - 2, 8, 5, darker);
  oMirrorRect(buf, w, h, bodyCx, face, 1, bodyTopY - 3, 8, 5, light);
  oMirrorRect(buf, w, h, bodyCx, face, 1, bodyTopY - 1, 8, 3, base);

  /* --- Neck: a dark column that visually separates head from torso --- */
  rect(buf, w, h, torX + FIG.bodyW / 2 - 4, neckY - 1, 8, FIG.neckH + 2, C.outline);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 3, neckY, 6, FIG.neckH + 2, C.skinShade);
  rect(buf, w, h, torX + FIG.bodyW / 2 - 3, neckY + 1, 6, 1, C.outline);
  // Collar shadow cast on the chest.
  rect(buf, w, h, torX + 1, bodyTopY, FIG.bodyW - 2, 3, C.outline);
  rect(buf, w, h, torX + 2, bodyTopY + 2, FIG.bodyW - 4, 2, darker);

  /* --- Head --- */
  const headX = bodyCx + face * pose.headTilt;
  circle(buf, w, h, headX, headCy, FIG.headR + 1, C.outline);
  circle(buf, w, h, headX, headCy + 1, FIG.headR, C.skinShade);
  circle(buf, w, h, headX, headCy - 1, FIG.headR - 1, C.skin);
  // Helmet dome with a crest, leaving the face visible.
  dome(buf, w, h, headX, headCy - 1.5, FIG.headR + 1, FIG.headR + 1.5, base);
  dome(buf, w, h, headX - 1, headCy - 2, FIG.headR - 1.5, FIG.headR - 0.5, light);
  rect(buf, w, h, headX - 1.5, headCy - FIG.headR - 3, 3, 4, lighter);
  // Cheek guard on the far side, eye and jaw on the near side.
  mirrorRect(buf, w, h, headX, face, -FIG.headR - 0.5, headCy - 2, 2.5, 6, dark);
  mirrorRect(buf, w, h, headX, face, 1, headCy - 1, 2.5, 2.5, C.outline);
  mirrorRect(buf, w, h, headX, face, 1.5, headCy + 3, 3, 1, C.outline);

  /* --- Front arm and weapon --- */
  const shX = bodyCx + face * 4;
  const handX = bodyCx + face * (4 + pose.handX);
  const handY = shoulderY + pose.handY;
  line(buf, w, h, shX, shoulderY, handX, handY, C.outline, 6);
  line(buf, w, h, shX, shoulderY, handX, handY, dark, 4);
  line(buf, w, h, shX, shoulderY - 1, handX, handY - 1, base, 2);
  oCircle(buf, w, h, handX, handY, 2.5, pick(C.skin));

  drawWeapon(buf, w, h, handX, handY, face, pose.weapon, weapon, white);
}

function colors(base, dark, darker, light) {
  return { base, dark, darker, light };
}

/** Body lying on the ground after the fall animation finished. */
function drawFallen(buf, w, h, floorY, cx, face, cols, weapon, white) {
  const y = floorY - 7;
  // The loser topples away from the winner: head away from the blow, legs
  // towards it. `face` points at the opponent, so it is also the direction the
  // body extends in.
  const dir = face;
  const bodyX = cx - dir * 3;

  ellipse(buf, w, h, bodyX + dir * 3, floorY - 1, 15, 2.8, C.shadow);

  // Torso on its back.
  oRect(buf, w, h, bodyX - 11, y, 22, 7, cols.base);
  rect(buf, w, h, bodyX - 10, y, 20, 2, cols.light);
  rect(buf, w, h, bodyX - 10, y + 5, 20, 2, cols.dark);
  rect(buf, w, h, bodyX - 10, y + 3, 20, 1, cols.darker);

  // Legs sticking out towards the winner.
  oRect(buf, w, h, bodyX + dir * 10, y + 1, 9, 5, cols.dark);
  oRect(buf, w, h, bodyX + dir * 17, y + 1, 4, 5, cols.darker);

  // Head resting on the floor, away from the winner.
  const headX = bodyX - dir * 15;
  circle(buf, w, h, headX, y + 2, FIG.headR + 1, C.outline);
  circle(buf, w, h, headX, y + 2, FIG.headR - 1, C.skinShade);
  dome(buf, w, h, headX, y + 1.5, FIG.headR + 0.5, FIG.headR, cols.base);

  // Arm flung out towards the winner.
  line(buf, w, h, bodyX + dir * 2, y + 4, bodyX + dir * 8, floorY - 2, C.outline, 5);
  line(buf, w, h, bodyX + dir * 2, y + 4, bodyX + dir * 8, floorY - 2, cols.darker, 3);

  // Weapon dropped clear of the body, lying at an angle so the blade and the
  // crossguard do not line up into a cross shape over the corpse.
  drawWeapon(buf, w, h, bodyX - dir * 25, floorY - 2, dir, 1.12, weapon, white);
}
