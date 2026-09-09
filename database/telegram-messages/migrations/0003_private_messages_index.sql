-- Speed up listing and paging private DM threads with the bot
CREATE INDEX IF NOT EXISTS idx_messages_private_chat_created
    ON all_messages_private (chat_id, created_at);
