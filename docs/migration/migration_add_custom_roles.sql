-- Migration script for Production Databases
-- Safely adds custom roles, permissions, and sub-user fields without destroying existing data.

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- 1. Add client_id and is_system columns to roles table if not present
ALTER TABLE `roles`
  ADD COLUMN IF NOT EXISTS `client_id` CHAR(36) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `is_system` TINYINT(1) NOT NULL DEFAULT '0';

-- Add index and FK for client_id on roles
SET @exist_fk_roles_client = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_name = 'fk_roles_client');
SET @sql_fk_roles_client = IF(@exist_fk_roles_client = 0, 'ALTER TABLE `roles` ADD CONSTRAINT `fk_roles_client` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;', 'SELECT 1;');
PREPARE stmt FROM @sql_fk_roles_client;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Mark existing roles (admin, staff, driver, client, operator) as system roles
UPDATE `roles` SET `is_system` = 1 WHERE `client_id` IS NULL;

-- 2. Create permissions table
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create role_permissions table
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rp_permission`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Add parent_client_id column to users table
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `parent_client_id` CHAR(36) NULL DEFAULT NULL;

-- Add FK for parent_client_id on users
SET @exist_fk_users_parent = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_name = 'fk_users_parent_client');
SET @sql_fk_users_parent = IF(@exist_fk_users_parent = 0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_parent_client` FOREIGN KEY (`parent_client_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;', 'SELECT 1;');
PREPARE stmt FROM @sql_fk_users_parent;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Seed default order permissions
INSERT INTO `permissions` (`id`, `name`, `description`) VALUES
('10000000-0000-4000-8000-000000000001', 'orders:create', 'Crear órdenes'),
('10000000-0000-4000-8000-000000000002', 'orders:read', 'Visualizar órdenes'),
('10000000-0000-4000-8000-000000000003', 'orders:update', 'Actualizar órdenes'),
('10000000-0000-4000-8000-000000000004', 'orders:delete', 'Eliminar órdenes')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 6. Assign default permissions to client system role ('44444444-4444-4444-8444-444444444444')
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`) VALUES
('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000001'),
('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000002'),
('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000003'),
('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000004');

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
