-- Migration: Create simplified client custom prices table
-- This replaces the complex price_lists architecture for a direct 1:1 client-to-item mapping

CREATE TABLE IF NOT EXISTS client_custom_prices (
    client_id CHAR(36) NOT NULL,
    item_id CHAR(36) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, item_id),
    CONSTRAINT fk_ccp_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ccp_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
