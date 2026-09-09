-- Conversation state for private chats with the bot (e.g. awaiting a name).
CREATE TABLE IF NOT EXISTS bot_dm_state (
    telegram_user_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
