-- Per-chat hashtag tallies for a member, as a JSON object of tag -> message count.
-- A tag counts once per message no matter how many times it repeats in that message.
ALTER TABLE member_stats ADD COLUMN hashtag_count TEXT NOT NULL DEFAULT '{}';
