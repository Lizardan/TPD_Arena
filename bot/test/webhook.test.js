import { describe, it, expect, beforeEach, vi } from 'vitest';
import { internals } from '../src/index.js';
import { arenaKey, menuKey } from '../src/arena.js';

function makeFakeKv() {
  const map = new Map();
  return {
    map,
    async get(key, type) {
      const v = map.get(key);
      return type === 'json' ? (v ? JSON.parse(v) : null) : v;
    },
    async put(key, value, opts) {
      map.set(key, value);
      void opts;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

const TOKEN = '123:TOKEN';
const chatId = -100123456;
const creatorId = 111;
const joinerId = 222;

function messageUpdate(text, fromId = creatorId, chatType = 'supergroup') {
  return {
    message: {
      message_id: 10,
      chat: { id: chatId, type: chatType },
      from: { id: fromId, username: `user${fromId}`, first_name: `User${fromId}` },
      text,
    },
  };
}

function callbackUpdate(data, fromId) {
  return {
    callback_query: {
      id: `cq${fromId}`,
      from: { id: fromId, username: `user${fromId}`, first_name: `User${fromId}` },
      message: { message_id: 10, chat: { id: chatId } },
      data,
    },
  };
}

function makeEnv() {
  const kv = makeFakeKv();
  return {
    env: { BOT_TOKEN: TOKEN, WEBHOOK_SECRET: 's3cret', ARENAS: kv },
    kv,
  };
}

function mockTelegram() {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    let body = null;
    if (init && init.body) {
      if (typeof init.body === 'string') body = JSON.parse(init.body);
      else body = { __formdata: true };
    }
    const method = String(url).split('/').pop();
    calls.push({ method, body, headers: init && init.headers });
    let result = { message_id: Math.floor(Math.random() * 100000) };
    if (method === 'answerCallbackQuery') result = true;
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  globalThis.fetch = fetchMock;
  return calls;
}

function lastByMethod(calls, method) {
  const found = calls.filter((c) => c.method === method);
  return found[found.length - 1];
}

/** The arena card is the message carrying an inline keyboard, not the menu hint. */
function arenaCardCall(calls) {
  const found = calls.filter(
    (c) => c.method === 'sendMessage' && c.body.reply_markup && c.body.reply_markup.inline_keyboard,
  );
  return found[found.length - 1];
}

/** Messages that carry the persistent bottom keyboard. */
function keyboardCalls(calls) {
  return calls.filter(
    (c) => c.method === 'sendMessage' && c.body.reply_markup && c.body.reply_markup.keyboard,
  );
}

function joinData(calls) {
  return arenaCardCall(calls).body.reply_markup.inline_keyboard[0][0].callback_data;
}

describe('webhook flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts /arena and saves arena in KV', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    const card = arenaCardCall(calls);
    expect(card).toBeDefined();
    expect(card.body.reply_markup.inline_keyboard[0][0].text).toMatch(/Выйти против/);
    expect(card.body.reply_markup.inline_keyboard[0][0].callback_data).toMatch(/^a\|-100123456\|/);
    expect(kv.map.has(arenaKey(chatId))).toBe(true);
  });

  it('rejects creator pressing own button', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    await internals.handleCallback(env, callbackUpdate(joinData(calls), creatorId));
    const ans = lastByMethod(calls, 'answerCallbackQuery');
    expect(ans.body.text).toMatch(/твой вызов/);
    expect(calls.filter((c) => c.method === 'deleteMessage')).toHaveLength(0);
  });

  it('joins, edits message, renders GIF, deletes and sends animation', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    await internals.handleCallback(env, callbackUpdate(joinData(calls), joinerId));

    const edit = lastByMethod(calls, 'editMessageText');
    expect(edit.body.text).toMatch(/🔥 ИДЁТ БОЙ/);
    expect(edit.body.reply_markup.inline_keyboard).toHaveLength(0);
    const del = lastByMethod(calls, 'deleteMessage');
    expect(del).toBeDefined();
    const anim = lastByMethod(calls, 'sendAnimation');
    expect(anim).toBeDefined();
    expect(anim.body.__formdata).toBe(true);
    expect(kv.map.has(arenaKey(chatId))).toBe(false);
  });

  it('rejects pressing an already consumed arena', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    const data = joinData(calls);
    await internals.handleCallback(env, callbackUpdate(data, joinerId));
    calls.length = 0;
    await internals.handleCallback(env, callbackUpdate(data, 333));
    const ans = lastByMethod(calls, 'answerCallbackQuery');
    expect(ans).toBeDefined();
    expect(ans.body.text).toMatch(/закрыта/);
  });

  it('tells the user arena works only in groups', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId, 'private'));
    const sm = lastByMethod(calls, 'sendMessage');
    expect(sm.body.text).toMatch(/только в групповых чатах/);
    expect(keyboardCalls(calls)).toHaveLength(0);
  });

  it('recognises arena command variants', () => {
    for (const t of ['/arena', '/арена', '/arena@MyBot', '/арена@MyBot']) {
      expect(internals.isArenaCommand(t)).toBe(true);
    }
    expect(internals.isArenaCommand('/help')).toBe(false);
  });

  it('recognises the bottom keyboard button label', () => {
    expect(internals.isArenaCommand(internals.ARENA_BUTTON)).toBe(true);
    expect(internals.isArenaCommand('выйти на арену')).toBe(true);
    expect(internals.isArenaCommand('Выйти на арену!')).toBe(true);
    expect(internals.isArenaCommand('выйти на улицу')).toBe(false);
  });
});

describe('command menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes arena and stop in the menu', () => {
    expect(internals.BOT_COMMANDS).toEqual([
      { command: 'arena', description: 'Выйти на арену' },
      { command: 'stop', description: 'Офнуть все арены в чате' },
    ]);
  });

  it('registers the menu once per worker instance', async () => {
    const calls = mockTelegram();
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    const { env } = makeEnv();

    const request = () => new Request('https://bot.example/hook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 's3cret' },
      body: JSON.stringify(messageUpdate('/arena', creatorId)),
    });

    await internals.handleWebhook(request(), env, ctx);
    await internals.handleWebhook(request(), env, ctx);
    await Promise.all(pending);

    const syncs = calls.filter((c) => c.method === 'setMyCommands');
    expect(syncs).toHaveLength(1);
    expect(syncs[0].body.commands).toEqual(internals.BOT_COMMANDS);
  });
});

describe('bottom keyboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('installs a persistent styled keyboard once per chat', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();

    await internals.handleMessage(env, messageUpdate('/arena', creatorId));

    const kbs = keyboardCalls(calls);
    expect(kbs).toHaveLength(1);
    const markup = kbs[0].body.reply_markup;
    expect(markup.is_persistent).toBe(true);
    expect(markup.resize_keyboard).toBe(true);
    expect(markup.input_field_placeholder).toBe('Кнопки или /arena');
    expect(markup.keyboard[0][0].text).toBe(internals.ARENA_BUTTON);
    expect(markup.keyboard[0][0].style).toBe('primary');
    expect(kv.map.has(menuKey(chatId))).toBe(true);

    // A second arena in the same chat must not re-post the keyboard.
    kv.map.delete(arenaKey(chatId));
    calls.length = 0;
    await internals.handleMessage(env, messageUpdate('/arena', joinerId));
    expect(keyboardCalls(calls)).toHaveLength(0);
    expect(arenaCardCall(calls)).toBeDefined();
  });

  it('keeps the arena card to a single call to action', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));

    const rows = arenaCardCall(calls).body.reply_markup.inline_keyboard;
    expect(rows).toHaveLength(1);
    expect(rows[0][0].style).toBe('success');
    expect(rows[0][0].callback_data).toMatch(/^a\|/);
  });
});

describe('/stop closes every arena in the chat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels the pending arena and strips the card button', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    calls.length = 0;

    await internals.handleMessage(env, messageUpdate('/stop', joinerId));

    expect(kv.map.has(arenaKey(chatId))).toBe(false);
    const edit = lastByMethod(calls, 'editMessageText');
    expect(edit.body.text).toMatch(/АРЕНЫ ЗАКРЫТЫ/);
    expect(edit.body.reply_markup.inline_keyboard).toHaveLength(0);
    expect(lastByMethod(calls, 'sendMessage').body.text).toMatch(/закрыты/);
    // Nobody joined, so no fight was started.
    expect(calls.filter((c) => c.method === 'sendAnimation')).toHaveLength(0);
  });

  it('lets the creator stop their own arena too', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    calls.length = 0;

    await internals.handleMessage(env, messageUpdate('/stop', creatorId));

    expect(kv.map.has(arenaKey(chatId))).toBe(false);
    expect(lastByMethod(calls, 'sendMessage').body.text).toMatch(/закрыты/);
  });

  it('reports an empty chat instead of failing', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/stop', creatorId));
    expect(lastByMethod(calls, 'sendMessage').body.text).toMatch(/нет активных арен/);
    expect(calls.filter((c) => c.method === 'editMessageText')).toHaveLength(0);
  });

  it('tells the user /stop works only in groups', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/stop', creatorId, 'private'));
    expect(lastByMethod(calls, 'sendMessage').body.text).toMatch(/только в групповых чатах/);
  });

  it('recognises stop command variants', () => {
    for (const t of ['/stop', '/стоп', '/stop@MyBot', 'стоп']) {
      expect(internals.isStopCommand(t)).toBe(true);
    }
    expect(internals.isStopCommand('/arena')).toBe(false);
    expect(internals.isStopCommand('/stopwatch')).toBe(false);
  });
});

describe('legacy off-all callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('still closes arenas from cards already sitting in chats', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    calls.length = 0;

    await internals.handleCallback(env, callbackUpdate(`o|${chatId}`, joinerId));

    expect(lastByMethod(calls, 'answerCallbackQuery').body.text).toMatch(/закрыты/);
    expect(lastByMethod(calls, 'editMessageText').body.reply_markup.inline_keyboard).toHaveLength(0);
    expect(kv.map.has(arenaKey(chatId))).toBe(false);
  });

  it('reports an empty chat instead of failing', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleCallback(env, callbackUpdate(`o|${chatId}`, joinerId));
    expect(lastByMethod(calls, 'answerCallbackQuery').body.text).toMatch(/нет активных арен/);
    expect(calls.filter((c) => c.method === 'editMessageText')).toHaveLength(0);
  });

  it('is not mistaken for an arena join', () => {
    expect(internals.parseOffAll(`o|${chatId}`)).toEqual({ chatId });
    expect(internals.parseOffAll('a|-100123456|abcd')).toBeNull();
    expect(internals.parseCallback(`o|${chatId}`)).toBeNull();
    expect(internals.parseCallback('a|-100123456|abcd')).toEqual({ chatId, arenaId: 'abcd' });
  });
});
