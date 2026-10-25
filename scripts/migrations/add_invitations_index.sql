-- Migration to add index on invitations.created_at
-- Improves sorted paginated listing by creation date (consistent with orders, invoices, and users).

ALTER TABLE invitations ADD INDEX idx_invitations_created_at (created_at);
