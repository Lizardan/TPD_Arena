import { simulateBattle, battleResultText } from './battle.js';
import { renderBattle } from './renderer.js';
import { encodeGif } from './gif.js';
import { createTelegram } from './telegram.js';
import { loadArena, saveArena, deleteArena, randId } from './arena.js';

const COLORS = ['#ff9b3d', '#4da6ff', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c', '#e67e22'];

function displayName(from) {
  if (!from) return 'Боец';
  return from.username || from.first_name || 'Боец';
}

function shortName(name) {
  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
}

function colorFor(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function rollStats(from) {
  const id = from && from.id !== undefined ? from.id : 0;
  // Deterministic-ish random from user id + time bucket, so stats are stable within an arena.
  const rand = mulberry32(id ^ Date.now());
  return {
    hp: 80 + Math.floor(rand() * 101),        // 80..180
    attackPower: 6 + Math.floor(rand() * 21),  // 6..26
    attackSpeed: Math.round((0.6 + rand() * 1.2) * 10) / 10, // 0.6..1.8
  };
}

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

function arenaText(arena) {
  const f = arena.left;
  return [
    '⚔️ АРЕНА СОЗДАНА',
    '',
    `🥊 ${f.name} вызывает на бой!`,
    '',
    `❤️ HP: ${f.hp}   ⚡ Сила: ${f.attackPower}   🏃 Скорость: ${f.attackSpeed}`,
    '',
    'Принимай вызов кнопкой ниже 👇',
  ].join('\n');
}

function fightAnnounce(arena) {
  const l = arena.left;
  const r = arena.right;
  return [
    '🔥 ИДЁТ БОЙ!',
    '',
    `🥊 ${l.name}`,
    `❤️ ${l.hp}  ⚡ ${l.attackPower}  🏃 ${l.attackSpeed}`,
    '        ⚔️ vs',
    `🥊 ${r.name}`,
    `❤️ ${r.hp}  ⚡ ${r.attackPower}  🏃 ${r.attackSpeed}`,
  ].join('\n');
}

function parseCallback(data) {
  const parts = String(data).split('|');
  if (parts.length !== 3 || parts[0] !== 'a') return null;
  const chatId = Number(parts[1]);
  if (!Number.isInteger(chatId)) return null;
  return { chatId, arenaId: parts[2] };
}

function isArenaCommand(text) {
  const t = text.trim().toLowerCase();
  return t === '/arena' || t === '/арена'
    || t === '/arena@' || t === '/арена@'
    || t.startsWith('/arena@') || t.startsWith('/арена@')
    || t === 'arena' || t === 'арена';
}

async function processFight(env, chatId, messageId, left, right) {
  const bot = createTelegram(env);
  const req = { left, right };
  const battle = simulateBattle(req);
  const rendered = renderBattle(req);
  const gif = encodeGif(rendered.frames, rendered.width, rendered.height, rendered.palette, rendered.delayMs);

  await bot.deleteMessage(chatId, messageId).catch(() => {});
  const caption = [`⚔️ ${left.name} vs ${right.name}`, battleResultText(battle)].join('\n');
  await bot.sendAnimation(chatId, gif, caption);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok');
    }

    if (request.method === 'POST' && url.pathname === '/hook') {
      return handleWebhook(request, env, ctx);
    }

    if (request.method === 'POST' && url.pathname === '/render') {
      return handleRender(request, env);
    }

    return new Response('not found', { status: 404 });
  },
};

async function handleWebhook(request, env, ctx) {
  if (env.WEBHOOK_SECRET
    && request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (update.message && update.message.text) {
    await handleMessage(env, update);
  } else if (update.callback_query) {
    ctx.waitUntil(handleCallback(env, update));
  }

  return new Response('ok');
}

async function handleMessage(env, update) {
  const bot = createTelegram(env);
  const msg = update.message;
  const text = msg.text || '';

  if (!isArenaCommand(text)) return;

  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') {
    await bot.sendMessage(chatId, '⚔️ Команда /arena работает только в групповых чатах.');
    return;
  }

  const from = msg.from;
  const existing = await loadArena(env, chatId);
  if (existing) {
    await bot.sendMessage(chatId, '⚔️ В этом чате уже собирается бой. Прими вызов или подожди.');
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
      color: colorFor(from.id),
    },
    right: null,
  };

  const button = {
    text: `⚔️ Выйти против ${shortName(arena.left.name)}`,
    callback_data: `a|${chatId}|${arena.id}`,
  };
  const resp = await bot.sendMessage(chatId, arenaText(arena), {
    reply_markup: { inline_keyboard: [[button]] },
  });
  if (resp && resp.ok && resp.result) arena.messageId = resp.result.message_id;
  await saveArena(env, chatId, arena);
}

async function handleCallback(env, update) {
  const bot = createTelegram(env);
  const cq = update.callback_query;
  const parsed = parseCallback(cq.data);
  if (!parsed) {
    await bot.answerCallbackQuery(cq.id, 'Сломанная кнопка 🤔');
    return;
  }

  const { chatId, arenaId } = parsed;
  const fromId = cq.from.id;

  const existing = await loadArena(env, chatId);
  if (!existing || existing.id !== arenaId) {
    await bot.answerCallbackQuery(cq.id, 'Эта арена уже закрыта');
    return;
  }
  if (existing.creatorId === fromId) {
    await bot.answerCallbackQuery(cq.id, 'Это твой вызов — жди соперника!');
    return;
  }

  const right = {
    name: displayName(cq.from),
    ...rollStats(cq.from),
    color: colorFor(fromId),
  };
  existing.right = right;

  await deleteArena(env, chatId);

  await bot.answerCallbackQuery(cq.id, 'Бой принят! 🔥');
  await bot.editMessageText(chatId, existing.messageId, fightAnnounce(existing));

  return processFight(env, chatId, existing.messageId, existing.left, existing.right);
}

async function handleRender(request, env) {
  if (env.RENDER_KEY && request.headers.get('x-render-key') !== env.RENDER_KEY) {
    return new Response('unauthorized', { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  try {
    const rendered = renderBattle(body);
    const gif = encodeGif(rendered.frames, rendered.width, rendered.height, rendered.palette, rendered.delayMs);
    return new Response(gif, {
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(`render error: ${err.message}`, { status: 400 });
  }
}

export const internals = {
  handleWebhook,
  handleMessage,
  handleCallback,
  processFight,
  parseCallback,
  isArenaCommand,
  displayName,
  rollStats,
};