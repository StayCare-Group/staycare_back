-- Migration: Add dashboard classification columns to items table (single ALTER).
-- - category: existing items start as 'others'.
-- - requires_ironing: existing items start as 0 (not ironed).
-- Administrators then assign the correct values in Item Management.
ALTER TABLE `items`
  ADD COLUMN `category` ENUM('sheets', 'covers', 'towels', 'pillow_cases', 'others') NOT NULL DEFAULT 'others'
    AFTER `name`,
  ADD COLUMN `requires_ironing` TINYINT(1) NOT NULL DEFAULT '0'
    AFTER `category`;

-- If the `category` column was already created with 'mats_and_cloths', run these instead:
-- UPDATE `items` SET `category` = 'others' WHERE `category` = 'mats_and_cloths';
-- ALTER TABLE `items`
--   MODIFY COLUMN `category` ENUM('sheets', 'covers', 'towels', 'pillow_cases', 'others') NOT NULL DEFAULT 'others';
