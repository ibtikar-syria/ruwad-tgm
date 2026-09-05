/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    TELEGRAM_MESSAGES_DB: D1Database
    MAIN_DB: D1Database
    TELEGRAM_BOT_TOKEN: string
    TELEGRAM_WEBHOOK_SECRET: string
    ADMIN_SECRET: string
  }
}

type CloudflareBindings = Cloudflare.Env
