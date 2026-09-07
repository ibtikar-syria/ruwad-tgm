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
