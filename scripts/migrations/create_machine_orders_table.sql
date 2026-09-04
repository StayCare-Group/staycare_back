-- Migration: create_machine_orders_table.sql
-- Description: Permite asignar múltiples órdenes a una misma máquina en paralelo.

CREATE TABLE IF NOT EXISTS `machine_orders` (
  `id` CHAR(36) NOT NULL,
  `machine_id` CHAR(36) NOT NULL,
  `order_id` CHAR(36) NOT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_machine_order` (`machine_id`, `order_id`),
  KEY `idx_mo_machine_id` (`machine_id`),
  KEY `idx_mo_order_id` (`order_id`),
  CONSTRAINT `fk_mo_machine` 
    FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_mo_order` 
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar asignaciones activas existentes de machines.current_order_id si las hubiera
INSERT IGNORE INTO `machine_orders` (`id`, `machine_id`, `order_id`, `assigned_at`)
SELECT 
  UUID(), 
  `id`, 
  `current_order_id`, 
  COALESCE(`started_at`, NOW())
FROM `machines` 
WHERE `current_order_id` IS NOT NULL;
