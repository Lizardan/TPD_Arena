# TPD Arena — Telegram-бот групповых боёв с GIF-записями

Всё-в-одном Cloudflare Worker (бесплатный тариф): бот (`/arena`) + детерминированная симуляция боя + рендер GIF без canvas/DOM (пиксельный буфер → gifenc).

## Как работает

1. В группе (или супергруппе) любой участник пишет `/arena` (или `/арена`).
2. Бот присылает «⚔️ АРЕНА СОЗДАНА» со случайной статистикой (HP / сила / скорость) и кнопкой **«⚔️ Выйти против @ник»**.
3. Другой участник жмёт кнопку → бот меняет текст на «🔥 ИДЁТ БОЙ!», рендерит GIF, удаляет сообщение и отправляет гифку в чат с подписью результата.

Ограничения: бот не может принять собственный вызов; на чат одна активная арена (протухает через 10 минут); callback-кнопка одноразовая.

## Структура

```
bot/
  src/
    index.js    — webhook-роутер: /hook, /render, /health
    arena.js    — состояние арены (KV ARENAS + fallback в память), TTL
    telegram.js — обёртка Telegram Bot API
    battle.js   — детерминированная симуляция боя
    renderer.js — рендер кадров 128×96 в индексированную палитру
    font.js     — растровый шрифт 3×5 (ASCII + кириллица)
    gif.js      — сборка GIF (gifenc)
  test/         — vitest: бой, рендер, вебхук-флоу
render/
  preview.html  — превью боёв в браузере (без деплоя)
```

## Локальный запуск / тесты

```bash
npm install
npm test        # vitest (21 тест)
npm run bench   # замер времени рендера
```

Превью: открой `render/preview.html` через HTTP-сервер (ES-модули не работают с `file://`):

```bash
cd F:\Unity Projects\TPD_Arena
npx serve .        # или: python -m http.server
# http://localhost:3000/render/preview.html
# в адрес можно добавить ?battle=<base64url-json> для конкретного боя
```

## Деплой через GitHub Actions (рекомендуется)

Workflow `.github/workflows/deploy.yml` сам: прогоняет тесты → создаёт KV namespace (если нет) → ставит секреты → `wrangler deploy` → подключает Telegram webhook.

**Нужно один раз:**

1. Создай репозиторий на GitHub (например `TPD_Arena`) и запуши код:
   ```bash
   git init -b main
   git add .
   git commit -m "TPD Arena: бот + GIF-рендер"
   git remote add origin https://github.com/<ваш_логин>/TPD_Arena.git
   git push -u origin main
   ```
2. В репозитории: `Settings → Secrets and variables → Actions` добавь секреты:
   | Секрет | Значение |
   |---|---|
   | `CF_API_TOKEN` | Cloudflare API-токен (правила: Workers Scripts Edit, Account Settings Read) |
   | `CLOUDFLARE_ACCOUNT_ID` | твой Account ID из дашборда Cloudflare |
   | `BOT_TOKEN` | токен бота из @BotFather (`8835068690:AAF7...`) |
   | `WEBHOOK_SECRET` | любая случайная строка (совпадёт с `secret_token` вебхука) |

   Пример `WEBHOOK_SECRET`: `l8ra28HRSw8e6QdRPSJT8jl8GeJ5d5KJ`.

3. Workflow стартует на `push` в `main`. Следи за `Actions` на GitHub.
4. Рабочий адрес бота: `https://tpd-arena-bot.<ACCOUNT_ID>.workers.dev/hook`. Проверь через `https://tpd-arena-bot.<ACCOUNT_ID>.workers.dev/health`.
5. Добавь бота в группу (включи права на удаление сообщений) и пиши `/arena`.

Ручной деплой тоже возможен — см. ниже.

## Ручной деплой

1. Создай бота у [@BotFather](https://t.me/BotFather) (отключи privacy mode в `/setprivacy`, чтобы бот видел команды).
2. Войди и создай KV namespace:

```bash
npx wrangler login
npx wrangler kv namespace create ARENAS
```

3. Вставь полученный `id` в `bot/wrangler.toml` (раскомментируй блок `kv_namespaces`).
4. Задай секреты:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

`WEBHOOK_SECRET` — любая случайная строка (бот проверяет заголовок `X-Telegram-Bot-Api-Secret-Token`).

5. Деплой:

```bash
npm run deploy
```

6. Привяжи вебхук (подставь свой URL и тот же secret):

```bash
npx wrangler secret put WEBHOOK_SECRET   # если ещё не задал
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev/hook&secret_token=<WEBHOOK_SECRET>"
```

7. В группу нужно добавить бота. Для удаления сообщений (атака!) у него должны быть права на удаление.

## Производительность (бесплатный тариф)

Прогретый 20-кадровый GIF 128×96: рендер + кодирование ≈ 1.2 мс, размер ~13 КБ — заметно внутри лимита ~10 мс CPU/запрос. Статистика в `bot/test/bench.mjs`, подбор параметров в `bot/test/sweep.mjs`.

Если на проде упрёшься в лимит: блочный сбор GIF по кадрам (промежуточные байты в KV) — см. план в коммит-истории проекта.

## Опционально: рендер по HTTP

`POST /render` принимает JSON боя и отдаёт `image/gif`:

```bash
curl -X POST https://<worker>.workers.dev/render \
  -H "Content-Type: application/json" \
  -d '{"left":{"name":"Иван","hp":100,"attackPower":12,"attackSpeed":1},"right":{"name":"Петя","hp":100,"attackPower":8,"attackSpeed":2}}' \
  -o battle.gif
```

При заданном `RENDER_KEY` в `[vars]` нужен заголовок `X-Render-Key` (в `wrangler.toml`).

## Формат JSON боя

```jsonc
{
  "left":  { "name": "имя (≤ 8 в HUD)", "hp": 80, "attackPower": 12, "attackSpeed": 1.0, "color": "#rrggbb" },
  "right": { ... },
  // hp: 1..999, attackPower: 1..999, attackSpeed: 0.1..10
  // color необязателен — выберется цвет по имени
}
```

Все поля валидируются; симуляция детерминирована (равные тайминги → первым левый).

## Маршруты

- `POST /hook` — вебхук Telegram (проверка `X-Telegram-Bot-Api-Secret-Token`)
- `POST /render` — рендер GIF по JSON (опц. авторизация `X-Render-Key`)
- `GET /health` — «ok»