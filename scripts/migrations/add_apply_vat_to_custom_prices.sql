-- Migration to add VAT configuration for custom prices
-- 1. Adds apply_vat_to_custom_prices flag to client_profiles (0 = disabled by default, 1 = enabled)
-- 2. Adds vat_applied snapshot flag to order_items to indicate whether VAT was added to that item

ALTER TABLE client_profiles ADD COLUMN apply_vat_to_custom_prices TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN vat_applied TINYINT(1) NOT NULL DEFAULT 0;
