-- Telegram groups the bot has seen
CREATE TABLE IF NOT EXISTS groups (
    chat_id TEXT PRIMARY KEY,
    title TEXT,
    username TEXT,
    is_forum INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Forum topics within a group (message_thread_id)
CREATE TABLE IF NOT EXISTS topics (
    chat_id TEXT NOT NULL,
    message_thread_id TEXT NOT NULL,
    title TEXT,
    is_general INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, message_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_topics_chat
    ON topics (chat_id, updated_at DESC);

-- Telegram users (members)
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL UNIQUE,
    membership_id TEXT,
    custom_name TEXT,
    display_name TEXT,
    username TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_members_membership_id
    ON members (membership_id);

-- Membership of a user in a group
CREATE TABLE IF NOT EXISTS group_members (
    chat_id TEXT NOT NULL,
    telegram_user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (chat_id, telegram_user_id)
);

-- Per-group interaction counters (incremented on ingest)
CREATE TABLE IF NOT EXISTS member_stats (
    chat_id TEXT NOT NULL,
    telegram_user_id TEXT NOT NULL,
    messages_count INTEGER NOT NULL DEFAULT 0,
    replies_count INTEGER NOT NULL DEFAULT 0,
    reactions_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, telegram_user_id)
);

-- App settings (key/value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
