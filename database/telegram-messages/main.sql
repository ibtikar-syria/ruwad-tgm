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

-- Polls (latest state; linked to the message that posted them)
CREATE TABLE IF NOT EXISTS polls (
    poll_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    message_db_id TEXT,
    telegram_message_id TEXT,
    question TEXT,
    poll_json TEXT NOT NULL,
    total_voter_count INTEGER NOT NULL DEFAULT 0,
    is_closed INTEGER NOT NULL DEFAULT 0,
    is_anonymous INTEGER NOT NULL DEFAULT 1,
    allows_multiple_answers INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_polls_chat
    ON polls (chat_id);

CREATE INDEX IF NOT EXISTS idx_polls_message
    ON polls (message_db_id);

-- Individual votes (non-anonymous polls)
CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_ids TEXT NOT NULL,
    vote_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll
    ON poll_votes (poll_id);
