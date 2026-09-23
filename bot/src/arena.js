export const ARENA_TTL = 600;

/**
 * How long a chat is remembered as "already got the bottom keyboard".
 * The keyboard is persistent, so it only has to be installed once per chat.
 */
const MENU_TTL = 60 * 60 * 24 * 30;

const data = new Map();
const menuSent = new Set();

export function arenaKey(chatId) {
  return `arena:${chatId}`;
}

export function menuKey(chatId) {
  return `menu:${chatId}`;
}

function isFresh(arena) {
  return arena && Date.now() - arena.createdAt < ARENA_TTL * 1000;
}

export async function loadArena(env, chatId) {
  if (env.ARENAS) {
    try {
      const v = await env.ARENAS.get(arenaKey(chatId), 'json');
      return isFresh(v) ? v : null;
    } catch {
      return null;
    }
  }
  const v = data.get(String(chatId));
  return isFresh(v) ? v : null;
}

export async function saveArena(env, chatId, arena) {
  if (env.ARENAS) {
    await env.ARENAS.put(arenaKey(chatId), JSON.stringify(arena), { expirationTtl: ARENA_TTL });
  } else {
    data.set(String(chatId), arena);
  }
}

export async function deleteArena(env, chatId) {
  if (env.ARENAS) {
    await env.ARENAS.delete(arenaKey(chatId));
  } else {
    data.delete(String(chatId));
  }
}

/**
 * "Turn off every arena in this chat".
 *
 * The bot only ever keeps one pending arena per chat (`handleMessage` refuses to
 * open a second one while one is waiting), so this returns an empty list or a
 * single arena. The list shape keeps the semantics honest if that ever changes.
 */
export async function cancelArenas(env, chatId) {
  const arena = await loadArena(env, chatId);
  if (!arena) return [];
  await deleteArena(env, chatId);
  return [arena];
}

/** True once the bottom keyboard has been installed in this chat. */
export async function loadMenu(env, chatId) {
  if (env.ARENAS) {
    try {
      return await env.ARENAS.get(menuKey(chatId), 'json');
    } catch {
      return null;
    }
  }
  return menuSent.has(String(chatId)) ? { sentAt: 0 } : null;
}

export async function saveMenu(env, chatId) {
  const value = { sentAt: Date.now() };
  if (env.ARENAS) {
    await env.ARENAS.put(menuKey(chatId), JSON.stringify(value), { expirationTtl: MENU_TTL });
  } else {
    menuSent.add(String(chatId));
  }
  return value;
}

export function randId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
