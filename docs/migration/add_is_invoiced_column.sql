-- -----------------------------------------------------
-- Migration: Replace 'facturado' status with 'is_invoiced' boolean
-- -----------------------------------------------------

USE `staycare`;

-- 1. Add the is_invoiced column
ALTER TABLE `orders` 
ADD COLUMN `is_invoiced` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;

-- 2. Migrate existing 'facturado' orders
UPDATE `orders` 
SET `is_invoiced` = 1, `status` = 'Completed' 
WHERE `status` = 'facturado';

-- 3. Update the status enum (MySQL 8 handles this with ALTER TABLE)
-- Note: In older MySQL versions, you might need to redefine the column.
-- Removing 'facturado' from the enum.
ALTER TABLE `orders` 
MODIFY COLUMN `status` ENUM(
  'Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 
  'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 'Delivered', 'Completed'
) NOT NULL DEFAULT 'Pending';
