export const ARENA_TTL = 600;

const data = new Map();

export function arenaKey(chatId) {
  return `arena:${chatId}`;
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

export function randId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}