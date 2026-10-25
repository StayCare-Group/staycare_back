-- Migration to add index on orders.created_at
-- This drastically improves paginated listing and date range filtering performance (from several seconds to milliseconds).

ALTER TABLE orders ADD INDEX idx_orders_created_at (created_at);
