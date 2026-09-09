-- Admin-editable alias for a member, independent of their Telegram display name
ALTER TABLE members ADD COLUMN custom_name TEXT;
