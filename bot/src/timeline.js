/**
 * Time warping for the GIF timeline.
 *
 * The raw simulation can run for a minute while a Telegram GIF has a budget of
 * a few dozen frames. Two naive approaches both fail:
 *
 *   - squeezing the whole battle uniformly destroys exactly what makes a fight
 *     readable: a 0.35 s swing ends up being a single frame and the result
 *     looks like a slideshow;
 *   - keeping every swing at full length does not fit at all - a fight with 30
 *     exchanges needs ~200 frames just for the strikes.
 *
 * So the timeline is built as a highlight reel instead of a compression:
 *
 *   1. every attack is collected as a "beat" (overlapping swings merge into one
 *      continuous beat, capped so a permanent melee still yields many beats);
 *   2. the beats that fit the frame budget are chosen evenly across the fight,
 *      always starting with the opening exchange and always ending on the
 *      killing blow, so the clip tells the whole story;
 *   3. each chosen beat plays at (almost) its real duration, which is what
 *      makes the animation smooth;
 *   4. the skipped time between beats becomes a short idle pause, so the
 *      fighters visibly wait in their idle stance between exchanges.
 *
 * A uniform scale-down survives only as a last resort for inputs that are not
 * reachable through the bot (e.g. 999 HP at speed 10 via /render).
 */

const MIN_IDLE_GAP = 0.06;      // gaps shorter than this are treated as continuous combat
const GAP_MIN_FRAMES = 2;       // a pause always gets at least this many frames
const GAP_MAX_FRAMES = 4;       // ... and never more than this, or the clip drags
const ACTION_MIN_FRAMES = 3.5;  // a beat never becomes shorter than this
const ACTION_MAX_FRAMES = 6;    // ... nor longer, so one beat cannot eat the budget
const MAX_BEAT = 1.2;           // seconds of continuous melee treated as one beat
const ACTION_SCALE_FLOOR = 0.4; // fastest an attack animation may be sped up

/**
 * Attack animation length for one fighter, derived from its own cadence.
 * Capped below the attack interval so a fast fighter still shows a short guard
 * stance between swings instead of being locked in a permanent attack pose.
 */
export function attackAnimDuration(attackSpeed, maxAnim = 0.5) {
  const interval = 1 / attackSpeed;
  const d = Math.min(maxAnim, interval * 0.7);
  return Math.max(0.22, d);
}

/**
 * Collects attack beats. Overlapping swings merge, but never into a beat longer
 * than MAX_BEAT, so an endless melee still produces a list to sample from.
 */
function collectWindows(battle, maxAnim) {
  const raw = [];
  for (const ev of battle.events) {
    if (ev.type === 'attack') {
      const speed = battle.fighters[ev.who].attackSpeed;
      raw.push({ t0: ev.t, t1: ev.t + attackAnimDuration(speed, maxAnim), death: false });
    }
  }
  const death = battle.events.find((e) => e.type === 'death');
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

/**
 * Picks `count` indices spread evenly across the list. Index 0 (the opening
 * exchange) and the last index (the killing blow) are always included.
 */
function selectEvenly(windows, count) {
  if (count >= windows.length) return windows.map((_, i) => i);
  if (count <= 1) return [windows.length - 1];
  const idx = [];
  for (let k = 0; k < count; k++) {
    idx.push(Math.round((k * (windows.length - 1)) / (count - 1)));
  }
  return [...new Set(idx)];
}

/** Merges intervals into a strictly sorted, non-overlapping union. */
function unionIntervals(list) {
  const out = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv.t0 <= last.t1) last.t1 = Math.max(last.t1, iv.t1);
    else out.push({ t0: iv.t0, t1: iv.t1 });
  }
  return out;
}

/**
 * Longest stretch of `[a, b]` that no attack overlaps.
 *
 * A pause between two chosen beats is only a real pause if nobody is swinging
 * during it - the skipped swings are exactly the ones that were not selected,
 * and sampling them at two frames is what makes an idle beat flicker through an
 * attack pose. Returns null when the whole range is busy.
 */
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

/**
 * Builds the sim -> gif time mapping.
 * Returns { segments, gifDuration, frames, simAt, attackScale, idleCap, beats }.
 */
export function buildTimeline(battle, cfg) {
  const {
    fps,
    maxFrames,
    holdAfter = 0.5,
    maxAttackAnim = 0.5,
  } = cfg;

  const windows = collectWindows(battle, maxAttackAnim);
  const holdFrames = Math.max(1, Math.round(holdAfter * fps));

  /** Frames a beat deserves: its real length, clamped to the readable window. */
  const beatFrames = (w) => {
    const play = Math.min(w.t1 - w.t0, ACTION_MAX_FRAMES / fps);
    return Math.max(ACTION_MIN_FRAMES, Math.min(ACTION_MAX_FRAMES, play * fps));
  };

  const frameCost = (picked) => picked.reduce((s, w) => s + beatFrames(w), 0)
    + picked.length * GAP_MIN_FRAMES
    + holdFrames;

  // As many beats as the budget holds, spread over the whole fight.
  const ceiling = Math.min(
    windows.length,
    Math.max(1, Math.floor((maxFrames - holdFrames) / (ACTION_MIN_FRAMES + GAP_MIN_FRAMES))),
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

  // Spend whatever is left on the pauses, so the clip fills the budget without
  // ever letting a single pause drag.
  let gapFrames = GAP_MIN_FRAMES;
  const spare = maxFrames - holdFrames - actionTotal - gapCount * gapFrames;
  if (spare > 0) gapFrames = Math.min(GAP_MAX_FRAMES, gapFrames + Math.floor(spare / gapCount));

  const segments = [];
  let gifCursor = 0;
  let simCursor = 0;

  const push = (simT0, simT1, kind, gifLen) => {
    if (simT1 <= simT0 || gifLen <= 0) return;
    segments.push({ simT0, simT1, gifT0: gifCursor, gifT1: gifCursor + gifLen, kind });
    gifCursor += gifLen;
  };

  const busy = unionIntervals(windows);
  const pauseLen = gapFrames / fps;

  const pushPause = (simA, simB) => {
    const free = longestFreeGap(busy, simA, simB);
    // Continuous melee: there is no idle moment to show, so cut straight to the
    // next beat instead of flashing a half-sampled swing.
    if (!free || free[1] - free[0] < MIN_IDLE_GAP) return;
    const len = Math.min(pauseLen, free[1] - free[0]);
    const mid = (free[0] + free[1]) / 2;
    push(mid - len / 2, mid + len / 2, 'idle', pauseLen);
  };

  chosen.forEach((w, i) => {
    pushPause(simCursor, w.t0);
    const playLen = Math.min(w.t1 - w.t0, ACTION_MAX_FRAMES / fps);
    // A beat that carries the killing blow must not start early and run out of
    // frames before the death itself - anchor the played window so it contains
    // the moment of death even if several swings merged into this beat.
    const playStart = w.deathT !== undefined
      ? Math.max(w.t0, Math.min(w.deathT, w.t1 - playLen))
      : w.t0;
    push(playStart, playStart + playLen, 'action', actionFrames[i] / fps);
    simCursor = Math.max(simCursor, w.t1);
  });

  const tailEnd = Math.max(battle.duration, ...chosen.map((w) => w.t1));
  pushPause(simCursor, tailEnd);
  // Hold the final pose so the loop does not snap back instantly.
  push(tailEnd, tailEnd + holdAfter, 'hold', holdFrames / fps);

  let frames = Math.max(2, Math.ceil(gifCursor * fps));
  let attackScale = 1;

  // Last resort: an input so extreme that even one beat does not fit. Scale
  // everything down uniformly rather than dropping the clip entirely.
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

  /**
   * Maps GIF time to simulation time. Segments are treated as left-closed and
   * right-open, so a frame landing exactly on a boundary belongs to the next
   * segment - that is what makes an attack start on the first frame of its beat
   * instead of lingering on the last idle frame.
   */
  const simAt = (gifT) => {
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
  };

  return {
    segments,
    gifDuration: gifCursor,
    frames,
    simAt,
    attackScale,
    idleCap: gapFrames / fps,
    beats: chosen.length,
    totalBeats: windows.length,
  };
}
