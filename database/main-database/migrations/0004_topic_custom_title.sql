-- Admin-editable topic name. Telegram's own title keeps syncing into `title`,
-- so this override survives the topic backfill in GET /api/groups.
ALTER TABLE topics ADD COLUMN custom_title TEXT;
