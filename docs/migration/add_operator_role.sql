-- -----------------------------------------------------
-- Migration: Add 'operator' role
-- -----------------------------------------------------

USE `staycare`;

-- Add the role with ID 5 (consistent with other roles)
INSERT INTO `roles` (`id`, `name`) 
VALUES (5, 'operator') 
ON DUPLICATE KEY UPDATE `name` = `name`;
