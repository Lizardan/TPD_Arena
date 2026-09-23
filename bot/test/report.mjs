/**
 * Builds a self-contained HTML report of the battle renderer.
 *
 * Renders a few representative fights, embeds each GIF as a data URI (so the
 * page works from disk with no server and no sibling files) and prints the
 * per-frame state table that proves the idle/attack alternation.
 *
 *   node test/report.mjs
 *
 * Output: render/battle-report.html
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { renderBattle, FREE_PROFILE } from '../src/renderer.js';
import { encodeGif } from '../src/gif.js';
import { simulateBattle } from '../src/battle.js';
import { computeFighterState } from '../src/fighter.js';

const mk = (hp, power, speed, name, color) => ({ name, hp, attackPower: power, attackSpeed: speed, color });

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function realisticFighters(seed) {
  const rand = mulberry32(seed);
  const make = (name) => ({
    name,
    hp: 80 + Math.floor(rand() * 101),
    attackPower: 6 + Math.floor(rand() * 21),
    attackSpeed: Math.round((0.6 + rand() * 1.2) * 10) / 10,
  });
  return { left: make('Игрок'), right: make('Соперник') };
}

const scenarios = [
  ['Обычный бой', 'самый тяжёлый из 40 боёв, набранных из диапазонов бота', realisticFighters(34)],
  ['Длинные никнеймы', 'максимальная длина ника: перенос на две строки, плашки не пересекаются', {
    left: mk(120, 10, 1.2, 'Очень_Длинный_Никнейм', '#ff5555'),
    right: mk(140, 9, 1.0, 'Второй_Длинный_Ник', '#55ff88'),
  }],
  ['Затяжной бой', '50 секунд, 30 разменов — в клип попадает выборка по всему бою', {
    left: mk(180, 6, 0.6, 'Танк', '#8888ff'),
    right: mk(180, 6, 0.6, 'Стена', '#ffaa44'),
  }],
  ['Враждебный вход', '999 HP при скорости 10 — недостижимо через бота, только через /render', {
    left: mk(999, 1, 10, 'A', '#ff5555'),
    right: mk(999, 1, 10, 'B', '#55ff88'),
  }],
];

const CODE = { idle: 'i', attack: 'a', hurt: 'h', dead: 'd' };
const CODE_TITLE = { i: 'idle', a: 'attack', h: 'hurt', d: 'dead' };

function timeRender(request) {
  for (let i = 0; i < 3; i++) {
    const r = renderBattle(request, FREE_PROFILE);
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
  }
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const r = renderBattle(request, FREE_PROFILE);
    const t1 = performance.now();
    encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
    const total = performance.now() - t0;
    if (total < best) best = total;
    void t1;
  }
  return best;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const cards = [];
for (const [title, note, request] of scenarios) {
  const r = renderBattle(request, FREE_PROFILE);
  const battle = simulateBattle(request);
  const gif = encodeGif(r.frames, r.width, r.height, r.palette, r.delayMs);
  const b64 = Buffer.from(gif).toString('base64');
  const ms = timeRender(request);

  const simAt = r.timeline.simAt;
  const rows = [];
  let bothIdle = 0;
  for (let g = 0; g < r.frames.length; g++) {
    const gifT = g / FREE_PROFILE.fps;
    const simT = simAt(gifT);
    const L = computeFighterState(battle, 'left', simT);
    const R = computeFighterState(battle, 'right', simT);
    if (L.mode === 'idle' && R.mode === 'idle') bothIdle++;
    const seg = r.timeline.segments.find((s) => gifT >= s.gifT0 && gifT < s.gifT1)
      || r.timeline.segments[r.timeline.segments.length - 1];
    rows.push({
      g, kind: seg.kind, simT,
      l: CODE[L.mode], rr: CODE[R.mode], hpL: L.hp, hpR: R.hp,
    });
  }

  const winner = battle.winner ? battle.fighters[battle.winner].name : '(никто — лимит времени)';
  const table = rows.map((x) => `<tr class="k-${x.kind}">`
    + `<td>${x.g}</td><td>${x.kind}</td><td>${x.simT.toFixed(2)}</td>`
    + `<td class="m m-${x.l}" title="${CODE_TITLE[x.l]}">${x.l}</td>`
    + `<td class="m m-${x.rr}" title="${CODE_TITLE[x.rr]}">${x.rr}</td>`
    + `<td>${x.hpL} / ${x.hpR}</td></tr>`).join('');

  cards.push(`
  <section class="card">
    <h2>${esc(title)}</h2>
    <p class="note">${esc(note)}</p>
    <div class="body">
      <div class="shot">
        <img src="data:image/gif;base64,${b64}" width="${r.width}" height="${r.height}" alt="${esc(title)}">
        <div class="meta">
          <span>${r.frames.length} кадров @ ${FREE_PROFILE.fps} fps</span>
          <span>${(r.frames.length / FREE_PROFILE.fps).toFixed(2)} с</span>
          <span>${Math.round(gif.length / 1024)} КиБ</span>
        </div>
      </div>
      <div class="facts">
        <dl>
          <dt>Симуляция</dt><dd>${battle.duration.toFixed(2)} с</dd>
          <dt>Победитель</dt><dd>${esc(winner)}</dd>
          <dt>Разменов в клипе</dt><dd>${r.timeline.beats} из ${r.timeline.totalBeats}</dd>
          <dt>Масштаб удара</dt><dd>&times;${r.timeline.attackScale.toFixed(2)}</dd>
          <dt>Пауза между</dt><dd>${Math.round(r.timeline.idleCap * FREE_PROFILE.fps)} кадр.</dd>
          <dt>Оба в idle</dt><dd>${bothIdle} кадр.</dd>
          <dt>Рендер + GIF</dt><dd>${ms.toFixed(1)} мс</dd>
        </dl>
      </div>
    </div>
    <details>
      <summary>Состояние по кадрам (i — idle, a — attack, h — hurt, d — dead)</summary>
      <div class="scroll"><table>
        <thead><tr><th>#</th><th>сегмент</th><th>sim, с</th><th>левый</th><th>правый</th><th>HP</th></tr></thead>
        <tbody>${table}</tbody>
      </table></div>
    </details>
  </section>`);
}

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>TPD Arena — отчёт по боевой сцене</title>
<style>
  :root {
    --bg: #16171d;
    --panel: #1e2027;
    --panel2: #262932;
    --line: #33363f;
    --fg: #e6e7ea;
    --dim: #9a9daa;
    --accent: #6ba8ff;
    --idle: #6f7484;
    --attack: #ffb347;
    --hurt: #ff6b6b;
    --dead: #7a4bd0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px;
    background: var(--bg); color: var(--fg);
    font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: var(--dim); margin: 0 0 28px; max-width: 70ch; }
  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 20px; margin-bottom: 20px;
  }
  .card h2 { font-size: 16px; margin: 0 0 4px; }
  .note { color: var(--dim); margin: 0 0 16px; font-size: 13px; }
  .body { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  .shot { flex: 0 0 auto; }
  .shot img {
    display: block; image-rendering: pixelated;
    border: 1px solid var(--line); border-radius: 6px; background: #000;
  }
  .meta { display: flex; gap: 12px; color: var(--dim); font-size: 12px; margin-top: 8px; }
  .facts { flex: 1 1 280px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
  dt { color: var(--dim); font-size: 13px; }
  dd { margin: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
  details { margin-top: 18px; }
  summary { cursor: pointer; color: var(--accent); font-size: 13px; }
  .scroll { max-height: 320px; overflow: auto; margin-top: 10px; border: 1px solid var(--line); border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { padding: 3px 10px; text-align: left; font-size: 12px; }
  thead th { position: sticky; top: 0; background: var(--panel2); border-bottom: 1px solid var(--line); }
  tbody tr:nth-child(even) { background: rgba(255,255,255,.02); }
  tbody tr.k-idle td:nth-child(2) { color: var(--idle); }
  tbody tr.k-action td:nth-child(2) { color: var(--attack); }
  tbody tr.k-hold td:nth-child(2) { color: var(--accent); }
  .m { font-weight: 700; }
  .m-i { color: var(--idle); }
  .m-a { color: var(--attack); }
  .m-h { color: var(--hurt); }
  .m-d { color: var(--dead); }
</style>
</head>
<body>
<div class="wrap">
  <h1>Боевая сцена TPD Arena</h1>
  <p class="lede">
    Профиль <code>${FREE_PROFILE.width}&times;${FREE_PROFILE.height}, ${FREE_PROFILE.fps} fps,
    до ${FREE_PROFILE.maxFrames} кадров</code>. Клип — не равномерное сжатие боя,
    а нарезка разменов: каждый удар играется в полную длину
    (${FREE_PROFILE.fps} fps, удар занимает 5&ndash;6 кадров), между ударами бойцы
    видны в idle, добивающий удар всегда в клипе. Время в таблице — это время
    симуляции, отображённое на кадр: видно, что в паузах оба бойца действительно
    стоят в idle, а не мигают позой атаки.
  </p>
${cards.join('\n')}
</div>
</body>
</html>
`;

const outPath = path.join(process.cwd(), '..', 'render', 'battle-report.html');
fs.writeFileSync(outPath, html);
console.log(`report -> ${outPath} (${Math.round(html.length / 1024)} KiB)`);
