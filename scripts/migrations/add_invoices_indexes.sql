-- Migration to add performance indexes on invoices table
-- This drastically improves paginated listing, date range filtering (issue_date) and status filtering.

ALTER TABLE invoices ADD INDEX idx_invoices_issue_date (issue_date);
ALTER TABLE invoices ADD INDEX idx_invoices_created_at (created_at);
ALTER TABLE invoices ADD INDEX idx_invoices_status_issue_date (status, issue_date);
