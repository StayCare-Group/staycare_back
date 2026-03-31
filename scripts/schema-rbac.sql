-- StayCare — esquema RBAC (MySQL 8+)
-- 1) CREATE DATABASE IF NOT EXISTS staycare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 2) USE staycare;
-- 3) Ejecutar este script completo (destruye tablas previas del mismo esquema).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS client_profiles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
  id            TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name          VARCHAR(32)       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB;

INSERT INTO roles (name) VALUES
  ('admin'),
  ('staff'),
  ('driver'),
  ('client');

CREATE TABLE users (
  id              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  name            VARCHAR(150)      NOT NULL,
  email           VARCHAR(150)      NOT NULL,
  password_hash   VARCHAR(255)      NOT NULL,
  phone           VARCHAR(30)           NULL,
  language        ENUM('en','es')   NOT NULL DEFAULT 'es',
  role_id         TINYINT UNSIGNED  NOT NULL,
  is_active       TINYINT(1)        NOT NULL DEFAULT 1,
  refresh_token   VARCHAR(512)          NULL,
  created_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role (role_id),
  KEY idx_users_active (is_active),

  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles (id)
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE client_profiles (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED      NOT NULL,
  contact_person      VARCHAR(150)      NOT NULL,
  billing_address     TEXT              NOT NULL,
  credits_terms_days  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  pricing_tier        ENUM('standard','premium','enterprise') NOT NULL DEFAULT 'standard',
  created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_client_profiles_user (user_id),

  CONSTRAINT fk_client_profiles_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE properties (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  client_profile_id   INT UNSIGNED      NOT NULL,
  property_name       VARCHAR(200)      NOT NULL,
  address             VARCHAR(300)      NOT NULL,
  city                VARCHAR(100)      NOT NULL DEFAULT '',
  area                VARCHAR(100)      NOT NULL DEFAULT '',
  created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_properties_client (client_profile_id),

  CONSTRAINT fk_properties_client_profile
    FOREIGN KEY (client_profile_id) REFERENCES client_profiles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_resets (
  id          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  email       VARCHAR(150)      NOT NULL,
  token       VARCHAR(255)      NOT NULL,
  expires_at  DATETIME          NOT NULL,
  used        TINYINT(1)        NOT NULL DEFAULT 0,
  created_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_password_resets_token (token),
  KEY idx_password_resets_email (email)
) ENGINE=InnoDB;
