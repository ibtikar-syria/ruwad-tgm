# Backend (Cloudflare Worker)

Hono API + Telegram webhook. See the [root README](../README.md) for full setup.

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler d1 migrations apply telegram-messages --local
npx wrangler d1 migrations apply main-database --local
npm run dev
```
