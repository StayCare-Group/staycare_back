-- StayCare UUID-first schema (MySQL 8+)
-- This script is intended for fresh environments or full rebuilds.
-- All primary keys and foreign keys are UUID strings (CHAR(36)).

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE SCHEMA IF NOT EXISTS `staycare` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `staycare`;

DROP TABLE IF EXISTS `route_orders`;
DROP TABLE IF EXISTS `routes`;
DROP TABLE IF EXISTS `password_resets`;
DROP TABLE IF EXISTS `order_status_history`;
DROP TABLE IF EXISTS `order_photos`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `machines`;
DROP TABLE IF EXISTS `items`;
DROP TABLE IF EXISTS `invoice_payments`;
DROP TABLE IF EXISTS `invoice_orders`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `properties`;
DROP TABLE IF EXISTS `invoice_line_items`;
DROP TABLE IF EXISTS `invoices`;
DROP TABLE IF EXISTS `invitations`;
DROP TABLE IF EXISTS `client_profiles`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `_migrations`;

CREATE TABLE `_migrations` (
  `id` CHAR(36) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_migrations_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) NULL DEFAULT NULL,
  `language` ENUM('en', 'es') NOT NULL DEFAULT 'en',
  `role_id` CHAR(36) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT '1',
  `refresh_token` VARCHAR(512) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  KEY `idx_users_role` (`role_id`),
  CONSTRAINT `fk_users_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `client_profiles` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `contact_person` VARCHAR(150) NOT NULL,
  `vat_number` VARCHAR(50) NOT NULL,
  `billing_address` TEXT NOT NULL,
  `credits_terms_days` SMALLINT UNSIGNED NOT NULL DEFAULT '30',
  `pricing_tier` ENUM('standard', 'premium', 'enterprise') NOT NULL DEFAULT 'standard',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_profiles_user` (`user_id`),
  UNIQUE KEY `uq_client_profiles_vat` (`vat_number`),
  CONSTRAINT `fk_client_profiles_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invitations` (
  `id` CHAR(36) NOT NULL,
  `token` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `role` ENUM('admin', 'staff', 'driver', 'operator', 'client') NOT NULL,
  `created_by` CHAR(36) NOT NULL,
  `used` TINYINT(1) NOT NULL DEFAULT '0',
  `used_at` DATETIME NULL DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invitations_token` (`token`),
  KEY `idx_invitations_email` (`email`),
  KEY `idx_invitations_expires` (`expires_at`),
  KEY `fk_invitations_creator` (`created_by`),
  CONSTRAINT `fk_invitations_creator`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoices` (
  `id` CHAR(36) NOT NULL,
  `invoice_number` VARCHAR(30) NOT NULL,
  `client_id` CHAR(36) NOT NULL,
  `issue_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `vat_percentage` DECIMAL(5,2) NOT NULL DEFAULT '18.00',
  `vat_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `total` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `status` ENUM('pending', 'paid', 'overdue') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_number` (`invoice_number`),
  KEY `idx_invoices_client` (`client_id`),
  KEY `idx_invoices_status` (`status`),
  KEY `idx_invoices_due_date` (`due_date`),
  KEY `idx_invoices_client_status` (`client_id`, `status`),
  CONSTRAINT `fk_invoices_client`
    FOREIGN KEY (`client_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_line_items` (
  `id` CHAR(36) NOT NULL,
  `invoice_id` CHAR(36) NOT NULL,
  `description` VARCHAR(300) NOT NULL,
  `quantity` SMALLINT UNSIGNED NOT NULL DEFAULT '1',
  `unit_price` DECIMAL(10,2) NOT NULL,
  `total_price` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inv_lines_invoice` (`invoice_id`),
  CONSTRAINT `fk_inv_lines_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `properties` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `property_name` VARCHAR(200) NOT NULL,
  `address` VARCHAR(300) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `area` VARCHAR(100) NOT NULL,
  `access_notes` TEXT NULL DEFAULT NULL,
  `lat` DECIMAL(10,7) NULL DEFAULT NULL,
  `lng` DECIMAL(10,7) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_properties_user` (`user_id`),
  CONSTRAINT `fk_properties_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` CHAR(36) NOT NULL,
  `order_number` VARCHAR(30) NOT NULL,
  `client_id` CHAR(36) NOT NULL,
  `property_id` CHAR(36) NULL DEFAULT NULL,
  `driver_id` CHAR(36) NULL DEFAULT NULL,
  `service_type` ENUM('standard', 'express') NOT NULL,
  `pickup_date` DATE NOT NULL,
  `pickup_window_start` DATETIME NOT NULL,
  `pickup_window_end` DATETIME NOT NULL,
  `estimated_bags` SMALLINT UNSIGNED NULL DEFAULT NULL,
  `actual_bags` SMALLINT UNSIGNED NULL DEFAULT NULL,
  `staff_confirmed_bags` SMALLINT UNSIGNED NULL DEFAULT NULL,
  `special_notes` TEXT NULL DEFAULT NULL,
  `status` ENUM('Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 'Delivered', 'Completed') NOT NULL DEFAULT 'Pending',
  `is_invoiced` TINYINT(1) NOT NULL DEFAULT '0',
  `subtotal` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `vat_percentage` DECIMAL(5,2) NOT NULL DEFAULT '18.00',
  `vat_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `total` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_number` (`order_number`),
  KEY `idx_orders_client` (`client_id`),
  KEY `idx_orders_driver` (`driver_id`),
  KEY `idx_orders_property` (`property_id`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_pickup_date` (`pickup_date`),
  CONSTRAINT `fk_orders_client_user`
    FOREIGN KEY (`client_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_driver`
    FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_property`
    FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_orders` (
  `invoice_id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`invoice_id`, `order_id`),
  KEY `idx_invoice_orders_order` (`order_id`),
  CONSTRAINT `fk_inv_orders_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inv_orders_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_payments` (
  `id` CHAR(36) NOT NULL,
  `invoice_id` CHAR(36) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `method` ENUM('cash', 'bank_transfer', 'card') NOT NULL,
  `transaction_reference` VARCHAR(200) NOT NULL,
  `paid_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inv_payments_invoice` (`invoice_id`),
  CONSTRAINT `fk_inv_payments_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `items` (
  `id` CHAR(36) NOT NULL,
  `item_code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `base_price` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  `is_active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_items_code` (`item_code`),
  KEY `idx_items_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `machines` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('washer', 'dryer', 'iron') NOT NULL,
  `capacity` DECIMAL(6,2) NOT NULL,
  `status` ENUM('available', 'running', 'maintenance') NOT NULL DEFAULT 'available',
  `current_order_id` CHAR(36) NULL DEFAULT NULL,
  `started_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_machines_name` (`name`),
  KEY `idx_machines_status` (`status`),
  KEY `idx_machines_type` (`type`),
  KEY `fk_machines_order` (`current_order_id`),
  CONSTRAINT `fk_machines_order`
    FOREIGN KEY (`current_order_id`) REFERENCES `orders` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_items` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `item_id` CHAR(36) NULL DEFAULT NULL,
  `item_code_snapshot` VARCHAR(20) NOT NULL,
  `name_snapshot` VARCHAR(200) NOT NULL,
  `quantity` SMALLINT UNSIGNED NOT NULL DEFAULT '1',
  `unit_price` DECIMAL(10,2) NOT NULL,
  `total_price` DECIMAL(10,2) NOT NULL,
  `qty_good` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `qty_bad` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `qty_stained` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_item` (`item_id`),
  CONSTRAINT `fk_order_items_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_photos` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `photo_url` VARCHAR(500) NOT NULL,
  `type` ENUM('before', 'after') NOT NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_photos_order` (`order_id`),
  KEY `idx_order_photos_type` (`order_id`, `type`),
  CONSTRAINT `fk_order_photos_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_status_history` (
  `id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `changed_by_user_id` CHAR(36) NULL DEFAULT NULL,
  `is_system` TINYINT(1) NOT NULL DEFAULT '0',
  `status` VARCHAR(30) NOT NULL,
  `note` TEXT NULL DEFAULT NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_history_order` (`order_id`),
  KEY `idx_order_history_date` (`order_id`, `changed_at`),
  KEY `fk_order_history_user` (`changed_by_user_id`),
  CONSTRAINT `fk_order_history_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_history_user`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_resets` (
  `id` CHAR(36) NOT NULL,
  `token` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `used` TINYINT(1) NOT NULL DEFAULT '0',
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_resets_token` (`token`),
  KEY `idx_password_resets_email` (`email`),
  KEY `idx_password_resets_exp` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `routes` (
  `id` CHAR(36) NOT NULL,
  `route_date` DATE NOT NULL,
  `driver_id` CHAR(36) NOT NULL,
  `area` VARCHAR(100) NOT NULL,
  `status` ENUM('planned', 'in_progress', 'completed') NOT NULL DEFAULT 'planned',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_routes_driver` (`driver_id`),
  KEY `idx_routes_date` (`route_date`),
  KEY `idx_routes_status` (`status`),
  KEY `idx_routes_date_driver` (`route_date`, `driver_id`),
  CONSTRAINT `fk_routes_driver`
    FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `route_orders` (
  `route_id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `position` SMALLINT UNSIGNED NOT NULL DEFAULT '0',
  PRIMARY KEY (`route_id`, `order_id`),
  KEY `idx_route_orders_order` (`order_id`),
  CONSTRAINT `fk_route_orders_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_route_orders_route`
    FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed roles with stable UUIDs (v4 format)
INSERT INTO `roles` (`id`, `name`) VALUES
('11111111-1111-4111-8111-111111111111', 'admin'),
('22222222-2222-4222-8222-222222222222', 'staff'),
('33333333-3333-4333-8333-333333333333', 'driver'),
('44444444-4444-4444-8444-444444444444', 'client'),
('55555555-5555-4555-8555-555555555555', 'operator')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Bootstrap users (Password: password123)
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role_id`) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'System Admin',  'admin@staycare.com',    '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Plant Staff',   'staff@staycare.com',    '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Main Driver',   'driver@staycare.com',   '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '33333333-3333-4333-8333-333333333333'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Test Client',   'client@staycare.com',   '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '44444444-4444-4444-8444-444444444444'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Main Operator', 'operator@staycare.com', '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '55555555-5555-4555-8555-555555555555')
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- Bootstrap client profile (for the client seed user)
INSERT INTO `client_profiles` (`id`, `user_id`, `contact_person`, `vat_number`, `billing_address`) VALUES
('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Test Client Contact', 'VAT12345678', '123 Business St, City')
ON DUPLICATE KEY UPDATE vat_number = VALUES(vat_number);

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
