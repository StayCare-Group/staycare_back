-- Migration to remove vat_number from client_profiles table
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE client_profiles DROP INDEX uq_client_profiles_vat;
ALTER TABLE client_profiles DROP COLUMN vat_number;

SET FOREIGN_KEY_CHECKS = 1;
