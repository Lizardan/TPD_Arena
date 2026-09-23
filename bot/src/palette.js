/**
 * Global indexed palette for the arena renderer.
 *
 * One shared palette keeps the GIF small (a single global colour table) and
 * lets every frame reference the same indices. The layout is fixed: helpers
 * below expose named constants so the rest of the renderer never hardcodes
 * a magic number.
 */

export const C = {
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
  R_LIGHTER: 38,
};

export const PALETTE_SIZE = 39;

const STATIC_COLORS = [
  [30, 34, 62],    // sky0  - deep zenith
  [44, 50, 86],    // sky1
  [62, 68, 108],   // sky2
  [86, 90, 134],   // sky3  - near horizon haze
  [58, 62, 100],   // mtnFar
  [42, 46, 78],    // mtnNear
  [34, 32, 52],    // wall
  [48, 46, 70],    // wallLight
  [76, 58, 48],    // floor0 - arena sand
  [92, 71, 57],    // floor1
  [118, 94, 74],   // floorLine
  [16, 16, 26],    // shadow
  [12, 12, 20],    // outline
  [26, 26, 38],    // hpBg
  [8, 8, 14],      // hpFrame
  [92, 214, 104],  // hpGreen
  [240, 208, 72],  // hpYellow
  [232, 76, 76],   // hpRed
  [206, 206, 218], // hpGhost - trailing bar of recently lost HP
  [248, 248, 254], // white
  [255, 228, 118], // damage
  [255, 252, 210], // spark
  [236, 182, 136], // skin
  [186, 132, 96],  // skinShade
  [214, 222, 234], // metal
  [140, 150, 170], // metalShade
  [126, 82, 48],   // wood
  [86, 54, 32],    // woodShade
  [158, 146, 124], // dust
];

const DEFAULT_LEFT = [255, 155, 61];
const DEFAULT_RIGHT = [77, 166, 255];

export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Darken towards black. */
function darken(rgb, f) {
  return [clamp(rgb[0] * f), clamp(rgb[1] * f), clamp(rgb[2] * f)];
}

/**
 * Lighten by mixing towards white. Mixing (rather than multiplying) keeps the
 * highlight visible even for very dark base colours such as #101010.
 */
function lighten(rgb, f) {
  return [
    clamp(rgb[0] + (255 - rgb[0]) * f),
    clamp(rgb[1] + (255 - rgb[1]) * f),
    clamp(rgb[2] + (255 - rgb[2]) * f),
  ];
}

/**
 * Builds the global palette. The two base colours are always present verbatim
 * so callers can rely on `palette[L_BASE]` being exactly the requested colour.
 */
export function buildPalette(leftColor, rightColor) {
  const left = leftColor || DEFAULT_LEFT;
  const right = rightColor || DEFAULT_RIGHT;
  return [
    ...STATIC_COLORS,
    darken(left, 0.42), darken(left, 0.70), left.slice(), lighten(left, 0.34), lighten(left, 0.56),
    darken(right, 0.42), darken(right, 0.70), right.slice(), lighten(right, 0.34), lighten(right, 0.56),
  ];
}

/** Returns the 5-tone ramp for a side as palette indices. */
export function ramp(side) {
  return side === 'left'
    ? { darker: C.L_DARKER, dark: C.L_DARK, base: C.L_BASE, light: C.L_LIGHT, lighter: C.L_LIGHTER }
    : { darker: C.R_DARKER, dark: C.R_DARK, base: C.R_BASE, light: C.R_LIGHT, lighter: C.R_LIGHTER };
}
