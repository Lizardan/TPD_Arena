import { describe, it, expect, beforeEach, vi } from 'vitest';
import { internals } from '../src/index.js';
import { arenaKey } from '../src/arena.js';

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

describe('webhook flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts /arena and saves arena in KV', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    const sm = lastByMethod(calls, 'sendMessage');
    expect(sm).toBeDefined();
    expect(sm.body.reply_markup.inline_keyboard[0][0].text).toMatch(/Выйти против/);
    expect(sm.body.reply_markup.inline_keyboard[0][0].callback_data).toMatch(/^a\|-100123456\|/);
    expect(kv.map.has(arenaKey(chatId))).toBe(true);
  });

  it('rejects creator pressing own button', async () => {
    const { env } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    const data = lastByMethod(calls, 'sendMessage').body.reply_markup.inline_keyboard[0][0].callback_data;
    await internals.handleCallback(env, callbackUpdate(data, creatorId));
    const ans = lastByMethod(calls, 'answerCallbackQuery');
    expect(ans.body.text).toMatch(/твой вызов/);
    expect(calls.filter((c) => c.method === 'deleteMessage')).toHaveLength(0);
  });

  it('joins, edits message, renders GIF, deletes and sends animation', async () => {
    const { env, kv } = makeEnv();
    const calls = mockTelegram();
    await internals.handleMessage(env, messageUpdate('/arena', creatorId));
    const data = lastByMethod(calls, 'sendMessage').body.reply_markup.inline_keyboard[0][0].callback_data;
    await internals.handleCallback(env, callbackUpdate(data, joinerId));

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
    const data = lastByMethod(calls, 'sendMessage').body.reply_markup.inline_keyboard[0][0].callback_data;
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
  });

  it('recognises arena command variants', () => {
    for (const t of ['/arena', '/арена', '/arena@MyBot', '/арена@MyBot']) {
      expect(internals.isArenaCommand(t)).toBe(true);
    }
    expect(internals.isArenaCommand('/help')).toBe(false);
  });
});