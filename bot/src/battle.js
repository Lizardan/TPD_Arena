export const ATTACK_DUR = 0.35;
export const IMPACT_DELAY = 0.09;
export const MAX_SIM_DURATION = 60;
export const MIN_ATTACK_SPEED = 0.1;
export const MAX_ATTACK_SPEED = 10;
export const MIN_HP = 1;
export const MAX_HP = 999;
export const MIN_POWER = 1;
export const MAX_POWER = 999;

function clampInt(value, min, max, field) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return n;
}

function sanitizeName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 24 ? trimmed.slice(0, 24) : trimmed;
}

function normalizeFighter(raw, side) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${side} fighter is missing.`);
  }
  const attackSpeed = Number(raw.attackSpeed);
  if (!Number.isFinite(attackSpeed)
    || attackSpeed < MIN_ATTACK_SPEED
    || attackSpeed > MAX_ATTACK_SPEED) {
    throw new Error(`${side}.attackSpeed must be between ${MIN_ATTACK_SPEED} and ${MAX_ATTACK_SPEED}.`);
  }
  return {
    name: sanitizeName(raw.name, side === 'left' ? 'ЛЕВЫЙ' : 'ПРАВЫЙ'),
    hp: clampInt(raw.hp, MIN_HP, MAX_HP, `${side}.hp`),
    attackPower: clampInt(raw.attackPower, MIN_POWER, MAX_POWER, `${side}.attackPower`),
    attackSpeed,
    color: typeof raw.color === 'string' ? raw.color : null,
  };
}

const ATTACK_RANK = { left: 0, right: 1 };

/**
 * Deterministic battle simulation.
 * Attack schedule: first strike at t = 1/attackSpeed, then every 1/attackSpeed.
 * Damage is applied at impact time (attack start + IMPACT_DELAY).
 */
export function simulateBattle(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Battle request is missing.');
  }
  const left = normalizeFighter(request.left, 'left');
  const right = normalizeFighter(request.right, 'right');

  const fighters = { left, right };
  const hp = { left: left.hp, right: right.hp };
  const interval = {
    left: 1 / left.attackSpeed,
    right: 1 / right.attackSpeed,
  };
  const nextAttack = { left: interval.left, right: interval.right };
  const events = [];
  const impacts = [];

  let winner = null;
  let endT = MAX_SIM_DURATION;

  const pushImpact = (imp) => {
    impacts.push(imp);
    impacts.sort((a, b) => (a.t - b.t) || (ATTACK_RANK[a.attacker] - ATTACK_RANK[b.attacker]));
  };

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
      const target = imp.target;
      hp[target] = Math.max(0, hp[target] - imp.damage);
      events.push({
        t: imp.t,
        type: 'impact',
        attacker: imp.attacker,
        target,
        damage: imp.damage,
        hpAfter: hp[target],
      });
      if (hp[target] <= 0) {
        winner = imp.attacker;
        events.push({ t: imp.t, type: 'death', who: target });
        endT = imp.t;
        break;
      }
      continue;
    }

    const who = nextAttack.left <= nextAttack.right ? 'left' : 'right';
    const target = who === 'left' ? 'right' : 'left';
    nextAttack[who] += interval[who];
    events.push({ t: nextAttackT, type: 'attack', who });
    pushImpact({
      t: nextAttackT + IMPACT_DELAY,
      attacker: who,
      target,
      damage: fighters[who].attackPower,
    });
  }

  events.push({ t: endT, type: 'end', winner });

  return {
    duration: endT,
    winner,
    finalHp: { left: hp.left, right: hp.right },
    fighters: { left, right },
    events,
  };
}

export function battleResultText(battle) {
  const winner = battle.fighters[battle.winner];
  const loser = battle.winner === 'left' ? battle.fighters.right : battle.fighters.left;
  const winnerHp = battle.finalHp[battle.winner];
  return `🏆 ${winner.name} победил ${loser.name} (осталось HP: ${winnerHp})`;
}
