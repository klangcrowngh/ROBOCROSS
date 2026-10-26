# Таблица лидеров (Cloudflare Worker + D1)

Хранит лучший счёт каждого игрока. Игрок определяется по подписанным данным Telegram
(`initData`), подпись проверяется токеном бота, поэтому записать счёт за другого нельзя.
Менять и удалять записи можно только из вашего аккаунта Cloudflare.

## Настройка через сайт Cloudflare (без командной строки)

1. **База.** Cloudflare → Storage & Databases → D1 → Create → имя `robocross`.
   Откройте базу → Console → вставьте содержимое `schema.sql` → Execute.
2. **Воркер.** Workers & Pages → Create → Worker → имя `robocross-leaderboard` → Deploy.
   Затем Edit code → замените код содержимым `worker.js` → Deploy.
3. **Привязка базы.** Воркер → Settings → Bindings → Add → D1 database:
   имя переменной `DB`, база `robocross`.
4. **Переменные.** Воркер → Settings → Variables and Secrets:
   - `BOT_TOKEN` — тип **Secret**, значение — токен бота от @BotFather;
   - `ALLOWED_ORIGIN` — `https://klangcrowngh.github.io`.
5. Скопируйте адрес воркера (вида `https://robocross-leaderboard.<аккаунт>.workers.dev`)
   и впишите его в `LB_URL` в `js/leaderboard.js`.

## Через командную строку (альтернатива)

```bash
npx wrangler d1 create robocross        # id базы → в wrangler.toml
npx wrangler d1 execute robocross --remote --file schema.sql
npx wrangler secret put BOT_TOKEN
npx wrangler deploy
```

## Управление

Таблицу видно и можно править в Cloudflare → D1 → `robocross` → Console, например:

```sql
SELECT * FROM scores ORDER BY score DESC LIMIT 100;
DELETE FROM scores WHERE user_id = 123456;
```
