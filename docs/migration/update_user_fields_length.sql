-- -----------------------------------------------------
-- Migration: Increase Field Lengths for Phone and VAT
-- -----------------------------------------------------

USE `staycare`;

-- 1. Increase phone column length in users table
ALTER TABLE `users` 
MODIFY COLUMN `phone` VARCHAR(100) NULL DEFAULT NULL;

-- 2. Increase vat_number column length in client_profiles table
ALTER TABLE `client_profiles` 
MODIFY COLUMN `vat_number` VARCHAR(100) NOT NULL;

-- 3. Confirming changes:
-- DESCRIBE users;
-- DESCRIBE client_profiles;
