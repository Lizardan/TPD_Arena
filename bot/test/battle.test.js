import { describe, it, expect } from 'vitest';
import { simulateBattle, ATTACK_DUR, IMPACT_DELAY } from '../src/battle.js';

const mk = (hp, power, speed, name) => ({ name, hp, attackPower: power, attackSpeed: speed });
const req = (l, r) => ({ left: mk(l[0], l[1], l[2], l[3]), right: mk(r[0], r[1], r[2], r[3]) });

describe('simulateBattle', () => {
  it('is deterministic for identical input', () => {
    const a = simulateBattle(req([100, 12, 1, 'A'], [100, 8, 2, 'B']));
    const b = simulateBattle(req([100, 12, 1, 'A'], [100, 8, 2, 'B']));
    expect(a).toEqual(b);
  });

  it('ends with a winner and a death', () => {
    const b = simulateBattle(req([100, 12, 1, 'A'], [100, 8, 2, 'B']));
    expect(['left', 'right']).toContain(b.winner);
    const deaths = b.events.filter((e) => e.type === 'death');
    expect(deaths.length).toBe(1);
    const loser = b.winner === 'left' ? 'right' : 'left';
    expect(deaths[0].who).toBe(loser);
  });

  it('schedules first strike at 1/attackSpeed, then every interval', () => {
    const b = simulateBattle(req([200, 10, 2, 'A'], [200, 10, 8, 'B']));
    const attacks = b.events.filter((e) => e.type === 'attack' && e.who === 'left').map((e) => e.t);
    expect(attacks[0]).toBeCloseTo(0.5, 6);
    expect(attacks[1]).toBeCloseTo(1.0, 6);
    expect(attacks[2]).toBeCloseTo(1.5, 6);
    const rightAttacks = b.events.filter((e) => e.type === 'attack' && e.who === 'right').map((e) => e.t);
    expect(rightAttacks[0]).toBeCloseTo(0.125, 6);
    expect(rightAttacks[1]).toBeCloseTo(0.25, 6);
  });

  it('applies damage at impact time after attack start', () => {
    const b = simulateBattle(req([100, 10, 1, 'A'], [100, 10, 0.5, 'B']));
    const firstImpact = b.events.find((e) => e.type === 'impact');
    const firstAttack = b.events.find((e) => e.type === 'attack');
    expect(firstImpact.attacker).toBe(firstAttack.who);
    expect(firstImpact.damage).toBe(firstAttack.who === 'left' ? 10 : 10);
    expect(firstImpact.hpAfter).toBe(firstImpact.attacker === 'left' ? 90 : 90);
  });

  it('HP never drops below zero and winner has positive HP', () => {
    for (let i = 0; i < 20; i++) {
      const b = simulateBattle(req(
        [100 + i, 6 + i, 1, 'A'],
        [80 + i * 2, 18, Math.max(0.5, (i % 5) + 1), 'B'],
      ));
      for (const side of ['left', 'right']) {
        expect(b.finalHp[side]).toBeGreaterThanOrEqual(0);
      }
      expect(b.finalHp[b.winner]).toBeGreaterThan(0);
    }
  });

  it('events are sorted by time', () => {
    const b = simulateBattle(req([90, 22, 1.5, 'A'], [120, 9, 2.5, 'B']));
    for (let i = 1; i < b.events.length; i++) {
      expect(b.events[i].t).toBeGreaterThanOrEqual(b.events[i - 1].t - 1e-9);
    }
  });

  it('validates stats', () => {
    expect(() => simulateBattle(req([0, 10, 1, 'A'], [100, 10, 1, 'B']))).toThrow(/hp/);
    expect(() => simulateBattle(req([100, 0, 1, 'A'], [100, 10, 1, 'B']))).toThrow(/attackPower/);
    expect(() => simulateBattle(req([100, 10, 0, 'A'], [100, 10, 1, 'B']))).toThrow(/attackSpeed/);
    expect(() => simulateBattle(null)).toThrow(/request/);
  });

  it('sanitizes names', () => {
    const b = simulateBattle(req([100, 10, 1, '  Dima  '], [100, 10, 1, '']));
    expect(b.fighters.left.name).toBe('Dima');
    expect(b.fighters.right.name).toBe('ПРАВЫЙ');
  });
});