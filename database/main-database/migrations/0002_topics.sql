-- Forum support: mark groups as forums and track topics
ALTER TABLE groups ADD COLUMN is_forum INTEGER NOT NULL DEFAULT 0;

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
