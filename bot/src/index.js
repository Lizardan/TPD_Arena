import { simulateBattle, battleResultText } from './battle.js';
import { renderBattle } from './renderer.js';
import { encodeGif } from './gif.js';
import { createTelegram } from './telegram.js';
import {
  loadArena,
  saveArena,
  deleteArena,
  cancelArenas,
  loadMenu,
  saveMenu,
  randId,
} from './arena.js';

const COLORS = ['#ff9b3d', '#4da6ff', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c', '#e67e22'];

/**
 * The bot menu. `/arena` opens a fight, `/stop` closes every pending arena in
 * the chat. Applied by CI on deploy and re-applied lazily by the worker
 * (see syncCommands).
 */
const BOT_COMMANDS = [
  { command: 'arena', description: 'Выйти на арену' },
  { command: 'stop', description: 'Офнуть все арены в чате' },
];

/** Label of the persistent bottom keyboard button. Pressing it sends this text. */
const ARENA_BUTTON = '⚔️ Выйти на арену';

const MENU_HINT = '⚔️ Кнопка «Выйти на арену» теперь всегда внизу 👇';

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

/**
 * Lower-cases the text and throws away everything that is not a letter, digit
 * or `@` — emoji, punctuation, slashes. So `/arena@MyBot`, `⚔️ Выйти на арену`
 * and `выйти   на арену!` all collapse to something comparable.
 */
const NOT_WORD = /[^a-z0-9а-яё@]+/g;

function normalizeText(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(NOT_WORD, ' ')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

const ARENA_WORDS = ['arena', 'арена'];
const STOP_WORDS = ['stop', 'стоп'];
const BUTTON_WORD = normalizeText(ARENA_BUTTON); // 'выйти на арену'

/** Matches `word`, `word@BotName` — anything else about the text is already stripped. */
function matchesWords(t, words) {
  if (!t) return false;
  if (words.includes(t)) return true;
  return words.some((w) => t.startsWith(`${w}@`));
}

function isArenaCommand(text) {
  const t = normalizeText(text);
  return t === BUTTON_WORD || matchesWords(t, ARENA_WORDS);
}

function isStopCommand(text) {
  return matchesWords(normalizeText(text), STOP_WORDS);
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

function offAllText(from) {
  return [
    '🛑 АРЕНЫ ЗАКРЫТЫ',
    '',
    `Остановил: ${displayName(from)}`,
    '',
    'Написать /arena — открыть новую.',
  ].join('\n');
}

/**
 * Inline button on the arena card — the only one. Closing the arena lives in
 * the `/stop` command, so the card stays a single clear call to action.
 *
 * `style` colours the button (blue/green/red) in Telegram clients released
 * after 9 Feb 2026; older clients simply render it unstyled. Custom emoji icons
 * (`icon_custom_emoji_id`) are deliberately not used — they need a Fragment
 * username or a Premium bot owner — so the emoji live inside the text.
 */
function arenaCard(arena) {
  return {
    inline_keyboard: [
      [
        {
          text: `⚔️ Выйти против ${shortName(arena.left.name)}`,
          callback_data: `a|${arena.chatId}|${arena.id}`,
          style: 'success',
        },
      ],
    ],
  };
}

/** The persistent keyboard that sits under the chat input. */
function arenaKeyboard() {
  return {
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Кнопки или /arena',
    keyboard: [[{ text: ARENA_BUTTON, style: 'primary' }]],
  };
}

function parseCallback(data) {
  const parts = String(data).split('|');
  if (parts.length !== 3 || parts[0] !== 'a') return null;
  const chatId = Number(parts[1]);
  if (!Number.isInteger(chatId)) return null;
  return { chatId, arenaId: parts[2] };
}

/** Parses the "off all arenas" callback: `o|<chatId>`. */
function parseOffAll(data) {
  const parts = String(data).split('|');
  if (parts.length !== 2 || parts[0] !== 'o') return null;
  const chatId = Number(parts[1]);
  if (!Number.isInteger(chatId)) return null;
  return { chatId };
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

/**
 * Re-registers the command menu once per worker isolate, so the menu is correct
 * even if it was edited by hand in BotFather. CI also calls setMyCommands on
 * deploy; this is the self-healing fallback.
 */
let commandsSynced = false;

function syncCommands(bot) {
  if (commandsSynced) return null;
  commandsSynced = true;
  return bot.setMyCommands(BOT_COMMANDS).catch(() => {});
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

  const canDefer = ctx && typeof ctx.waitUntil === 'function';

  const sync = syncCommands(createTelegram(env));
  if (sync && canDefer) ctx.waitUntil(sync);

  if (update.message && update.message.text) {
    await handleMessage(env, update);
  } else if (update.callback_query) {
    const job = handleCallback(env, update);
    if (canDefer) ctx.waitUntil(job);
    else await job;
  }

  return new Response('ok');
}

async function handleMessage(env, update) {
  const bot = createTelegram(env);
  const msg = update.message;
  const text = msg.text || '';
  const chatId = msg.chat.id;

  if (isStopCommand(text)) return handleStop(env, bot, msg);
  if (!isArenaCommand(text)) return;

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

  const resp = await bot.sendMessage(chatId, arenaText(arena), { reply_markup: arenaCard(arena) });
  if (resp && resp.ok && resp.result) arena.messageId = resp.result.message_id;
  await saveArena(env, chatId, arena);

  // A message carries either an inline keyboard or a reply keyboard, never both,
  // so the bottom keyboard travels on its own small message. It is persistent,
  // which is why it is installed only once per chat.
  if (!(await loadMenu(env, chatId))) {
    const sent = await bot
      .sendMessage(chatId, MENU_HINT, { reply_markup: arenaKeyboard() })
      .catch(() => null);
    if (sent && sent.ok) await saveMenu(env, chatId);
  }
}

/**
 * Cancels every pending arena in the chat and marks its card as closed.
 * Returns the closed arena, or null when there was nothing to close.
 */
async function closeArenas(env, bot, chatId, from, fallbackMessageId) {
  const cancelled = await cancelArenas(env, chatId);
  if (cancelled.length === 0) return null;

  const arena = cancelled[0];
  const messageId = arena.messageId || fallbackMessageId;
  if (messageId) {
    // editMessageText drops the inline keyboard by default, so the button goes away too.
    await bot.editMessageText(chatId, messageId, offAllText(from)).catch(() => {});
  }
  return arena;
}

/** `/stop` — anyone in the chat may close the pending arena. */
async function handleStop(env, bot, msg) {
  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') {
    await bot.sendMessage(chatId, '⚔️ Команда /stop работает только в групповых чатах.');
    return;
  }

  const closed = await closeArenas(env, bot, chatId, msg.from);
  await bot.sendMessage(
    chatId,
    closed ? '🛑 Арены в этом чате закрыты.' : 'В этом чате нет активных арен.',
  ).catch(() => {});
}

async function handleCallback(env, update) {
  const bot = createTelegram(env);
  const cq = update.callback_query;

  const off = parseOffAll(cq.data);
  if (off) return handleOffAll(bot, env, cq, off.chatId);

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

/**
 * Legacy handler for the `o|<chatId>` callback button that used to sit on the
 * arena card. The button is gone, but cards already sitting in chats still carry
 * it — answering them properly beats "сломанная кнопка".
 */
async function handleOffAll(bot, env, cq, chatId) {
  const msgChatId = cq.message && cq.message.chat ? cq.message.chat.id : chatId;
  if (msgChatId !== chatId) {
    await bot.answerCallbackQuery(cq.id, 'Сломанная кнопка 🤔');
    return;
  }

  const fallback = cq.message && cq.message.message_id;
  const closed = await closeArenas(env, bot, chatId, cq.from, fallback);
  await bot.answerCallbackQuery(cq.id, closed ? 'Арены закрыты 🛑' : 'В этом чате нет активных арен');
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
  MENU_HINT,
};
