const API = 'https://api.telegram.org';

export function createTelegram(env) {
  const token = env.BOT_TOKEN;
  const botPath = (method) => `${API}/bot${token}/${method}`;

  async function json(method, payload) {
    const res = await fetch(botPath(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function multipart(method, fields) {
    const fd = new FormData();
    for (const [key, value, name] of fields) {
      if (name) fd.append(key, value, name);
      else fd.append(key, value);
    }
    const res = await fetch(botPath(method), { method: 'POST', body: fd });
    return res.json();
  }

  return {
    async setMyCommands(commands) {
      return json('setMyCommands', { commands });
    },
    async sendMessage(chatId, text, opts = {}) {
      return json('sendMessage', { chat_id: chatId, text, ...opts });
    },
    async editMessageText(chatId, messageId, text, opts = {}) {
      return json('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: { inline_keyboard: [] },
        ...opts,
      });
    },
    async deleteMessage(chatId, messageId) {
      return json('deleteMessage', { chat_id: chatId, message_id: messageId });
    },
    async answerCallbackQuery(callbackQueryId, text = '') {
      const payload = { callback_query_id: callbackQueryId };
      if (text) payload.text = text;
      return json('answerCallbackQuery', payload);
    },
    async sendAnimation(chatId, bytes, caption) {
      return multipart('sendAnimation', [
        ['chat_id', String(chatId)],
        ['animation', new Blob([bytes], { type: 'image/gif' }), 'fight.gif'],
        ['caption', caption],
      ]);
    },
  };
}