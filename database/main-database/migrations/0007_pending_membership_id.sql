-- User-submitted membership ID awaiting admin approval before it becomes membership_id.
ALTER TABLE members ADD COLUMN pending_membership_id TEXT;
