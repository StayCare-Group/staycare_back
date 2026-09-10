-- ============================================================
-- StayCare — Migration: add_client_custom_prices_table
-- Safe to run on an existing production database.
-- Applies: creates the client_custom_prices table if it does
--          not already exist. No data is modified or deleted.
-- ============================================================

CREATE TABLE IF NOT EXISTS `client_custom_prices` (
  `client_id`  CHAR(36)      NOT NULL,
  `item_id`    CHAR(36)      NOT NULL,
  `price`      DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`, `item_id`),
  KEY `idx_ccp_item` (`item_id`),
  CONSTRAINT `fk_ccp_client`
    FOREIGN KEY (`client_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ccp_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
