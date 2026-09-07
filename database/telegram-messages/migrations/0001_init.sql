-- All Private Messages table
CREATE TABLE IF NOT EXISTS all_messages_private (
    id TEXT PRIMARY KEY,
    message_json TEXT NOT NULL,
    message_text TEXT,
    chat_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- All Group Messages table
CREATE TABLE IF NOT EXISTS all_messages_groups (
    id TEXT PRIMARY KEY,
    message_json TEXT NOT NULL,
    message_text TEXT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_thread_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_groups_chat_created
    ON all_messages_groups (chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_groups_user_chat
    ON all_messages_groups (user_id, chat_id);

-- Group reaction events
CREATE TABLE IF NOT EXISTS all_reactions_groups (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT,
    action TEXT NOT NULL CHECK (action IN ('add', 'remove')),
    reaction_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reactions_groups_chat_created
    ON all_reactions_groups (chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reactions_groups_user_chat
    ON all_reactions_groups (user_id, chat_id);
