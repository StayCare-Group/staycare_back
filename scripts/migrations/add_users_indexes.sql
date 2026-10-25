-- Migration to add performance indexes on users table
-- Drastically improves client listing (role + is_active + created_at),
-- sub-users listing (parent_client_id + created_at) and general date ordering.

ALTER TABLE users ADD INDEX idx_users_role_active_created (role_id, is_active, created_at);
ALTER TABLE users ADD INDEX idx_users_parent_created (parent_client_id, created_at);
ALTER TABLE users ADD INDEX idx_users_created_at (created_at);
