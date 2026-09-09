# Telegram Group Manager

Admin app + Telegram bot that stores group messages and shows per-member analytics (messages, replies, reactions). No points yet.

## Structure

- `backend/` — Hono on Cloudflare Workers (webhook + admin API)
- `frontend/` — Vite + React admin UI
- `database/telegram-messages/` — raw messages & reactions (D1)
- `database/main-database/` — groups, members, stats, settings (D1)

## Prerequisites

- Node.js 20+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Cloudflare account (for deploy); local D1 works without remote DBs

## Backend setup

```bash
cd backend
cp .dev.vars.example .dev.vars
# Edit .dev.vars with real secrets
npm install
```

`.dev.vars` keys:

| Key | Purpose |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | Bot API token |
| `TELEGRAM_WEBHOOK_SECRET` | Random string; Telegram sends it as `X-Telegram-Bot-Api-Secret-Token` |
| `ADMIN_SECRET` | Password for the admin UI |

Apply D1 migrations locally:

```bash
npx wrangler d1 migrations apply telegram-messages --local
npx wrangler d1 migrations apply main-database --local
```

Start the Worker:

```bash
npm run dev
```

Worker defaults to `http://127.0.0.1:8787`.

### Create remote D1 databases (deploy)

```bash
npx wrangler d1 create telegram-messages
npx wrangler d1 create main-database
```

Put the returned IDs into `wrangler.jsonc` (`database_id` for each binding), then:

```bash
npx wrangler d1 migrations apply telegram-messages --remote
npx wrangler d1 migrations apply main-database --remote
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_SECRET
npm run deploy
```

### Set Telegram webhook

After the Worker is publicly reachable (deploy or a tunnel such as Cloudflare Tunnel / ngrok), open **Settings** in the admin UI and use **Telegram webhook** → **Set webhook**. Paste the public Worker URL (or accept the suggested `…/telegram/webhook`). The app calls Telegram `setWebhook` with `TELEGRAM_WEBHOOK_SECRET` and the required update types.

Add the bot to a group. For reaction updates, give the bot permission to see messages (disable privacy mode via BotFather `/setprivacy` → Disable, or make the bot a group admin).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

UI at `http://127.0.0.1:5173`. Vite proxies `/api` to the Worker on port 8787.

Log in with the same value as `ADMIN_SECRET`.

## GitHub Actions (Cloudflare deploy)

Workflows under `.github/workflows/` deploy on `dev` / `main` (same flow as before, wired to this app).

Configure **Environments** `dev` and `main` with:

### Variables

| Variable | Used by |
|----------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | backend, db |
| `TELEGRAM_MESSAGES_DB_ID` / `TELEGRAM_MESSAGES_DB_NAME` | backend, db (D1 binding 0) |
| `MAIN_DB_ID` / `MAIN_DB_NAME` | backend, db (D1 binding 1) |
| `VITE_API_BASE_URL` | frontend build (backend Worker URL, no trailing slash) |

### Secrets

| Secret | Used by |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | all deploy/migrate jobs |
| `TELEGRAM_BOT_TOKEN` | backend |
| `TELEGRAM_WEBHOOK_SECRET` | backend |
| `ADMIN_SECRET` | backend |

Worker names: `group-manager-backend(-dev)`, `group-manager-frontend(-dev)`.

## Features

- **Chats** — Telegram-like list with forum topics nested under groups; message thread (read-only; info button shows stored message JSON)
- **Analytics** — per member: messages, replies, reactions (all groups or one group)
- **Settings** — assign `membership_id` and `custom_name` manually; optional display name setting
