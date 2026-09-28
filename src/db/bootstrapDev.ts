import fs from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";
import { config } from "../config";

function quoteIdentifier(value: string): string {
  return `\`${value.replace(/`/g, "``")}\``;
}

function normalizeSchemaSql(sql: string, dbName: string): string {
  const quotedDb = quoteIdentifier(dbName);
  return sql
    .replace(/`staycare`/g, quotedDb)
    .replace(/CREATE SCHEMA IF NOT EXISTS\s+`[^`]+`/i, `CREATE SCHEMA IF NOT EXISTS ${quotedDb}`)
    .replace(/USE\s+`[^`]+`\s*;/i, `USE ${quotedDb};`);
}

function extractSchemaOnly(sql: string): string {
  const marker = "-- Seed Data:";
  const idx = sql.indexOf(marker);
  return idx >= 0 ? sql.slice(0, idx) : sql;
}

async function resolveSchemaPath(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "docs/migration/staycare_mysql.sql"),
    path.resolve(__dirname, "../../docs/migration/staycare_mysql.sql"),
    path.resolve(__dirname, "../../../docs/migration/staycare_mysql.sql"),
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // keep searching candidate paths
    }
  }

  throw new Error(
    `Schema SQL not found. Checked: ${candidates.join(", ")}`,
  );
}

export async function autoInitDbForDevelopment(): Promise<void> {
  const isDevelopment = String(process.env.NODE_ENV || "").toLowerCase() === "development";
  const enabled = String(process.env.DEV_DB_AUTO_INIT ?? "true").toLowerCase() !== "false";
  if (!isDevelopment || !enabled) return;

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(config.db.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    const [[{ tableCount }]] = await conn.query(
      `SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = ?`,
      [config.db.database],
    ) as any;

    if (tableCount > 0) {
      console.log(`Development DB already initialized (${tableCount} tables found), running schema sync...`);
      try {
        await conn.query(
          `ALTER TABLE ${quoteIdentifier(config.db.database)}.orders MODIFY COLUMN status ENUM('Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 'Delivered', 'Completed', 'Cancelled', 'Rescheduled') NOT NULL DEFAULT 'Pending'`
        );
      } catch {
        /* ignore if column doesn't exist yet */
      }

      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS ${quoteIdentifier(config.db.database)}.\`machine_orders\` (
            \`id\` CHAR(36) NOT NULL,
            \`machine_id\` CHAR(36) NOT NULL,
            \`order_id\` CHAR(36) NOT NULL,
            \`assigned_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`uq_machine_order\` (\`machine_id\`, \`order_id\`),
            KEY \`idx_mo_machine_id\` (\`machine_id\`),
            KEY \`idx_mo_order_id\` (\`order_id\`),
            CONSTRAINT \`fk_mo_machine\` 
              FOREIGN KEY (\`machine_id\`) REFERENCES ${quoteIdentifier(config.db.database)}.\`machines\` (\`id\`) 
              ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`fk_mo_order\` 
              FOREIGN KEY (\`order_id\`) REFERENCES ${quoteIdentifier(config.db.database)}.\`orders\` (\`id\`) 
              ON DELETE CASCADE ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Migrar asignaciones activas existentes de machines.current_order_id si las hubiera
        await conn.query(`
          INSERT IGNORE INTO ${quoteIdentifier(config.db.database)}.\`machine_orders\` (\`id\`, \`machine_id\`, \`order_id\`, \`assigned_at\`)
          SELECT 
            UUID(), 
            \`id\`, 
            \`current_order_id\`, 
            COALESCE(\`started_at\`, NOW())
          FROM ${quoteIdentifier(config.db.database)}.\`machines\` 
          WHERE \`current_order_id\` IS NOT NULL
        `);
      } catch (err) {
        console.warn("Could not sync machine_orders table:", err);
      }

      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS ${quoteIdentifier(config.db.database)}.\`client_custom_prices\` (
            \`client_id\`  CHAR(36)      NOT NULL,
            \`item_id\`    CHAR(36)      NOT NULL,
            \`price\`      DECIMAL(10,2) NOT NULL,
            \`created_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`client_id\`, \`item_id\`),
            KEY \`idx_ccp_item\` (\`item_id\`),
            CONSTRAINT \`fk_ccp_client\`
              FOREIGN KEY (\`client_id\`) REFERENCES ${quoteIdentifier(config.db.database)}.\`users\` (\`id\`)
              ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`fk_ccp_item\`
              FOREIGN KEY (\`item_id\`) REFERENCES ${quoteIdentifier(config.db.database)}.\`items\` (\`id\`)
              ON DELETE RESTRICT ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      } catch (err) {
        console.warn("Could not sync client_custom_prices table:", err);
      }

      try {
        const db = quoteIdentifier(config.db.database);
        // Sync roles columns
        try { await conn.query(`ALTER TABLE ${db}.\`roles\` ADD COLUMN \`client_id\` CHAR(36) NULL DEFAULT NULL`); } catch {}
        try { await conn.query(`ALTER TABLE ${db}.\`roles\` ADD COLUMN \`is_system\` TINYINT(1) NOT NULL DEFAULT '0'`); } catch {}

        // Sync permissions table
        await conn.query(`
          CREATE TABLE IF NOT EXISTS ${db}.\`permissions\` (
            \`id\` CHAR(36) NOT NULL,
            \`name\` VARCHAR(100) NOT NULL,
            \`description\` VARCHAR(255) NULL DEFAULT NULL,
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`uq_permissions_name\` (\`name\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Sync role_permissions table
        await conn.query(`
          CREATE TABLE IF NOT EXISTS ${db}.\`role_permissions\` (
            \`role_id\` CHAR(36) NOT NULL,
            \`permission_id\` CHAR(36) NOT NULL,
            PRIMARY KEY (\`role_id\`, \`permission_id\`),
            KEY \`idx_rp_permission\` (\`permission_id\`),
            CONSTRAINT \`fk_rp_role\`
              FOREIGN KEY (\`role_id\`) REFERENCES ${db}.\`roles\` (\`id\`)
              ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`fk_rp_permission\`
              FOREIGN KEY (\`permission_id\`) REFERENCES ${db}.\`permissions\` (\`id\`)
              ON DELETE CASCADE ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Sync users column
        try { await conn.query(`ALTER TABLE ${db}.\`users\` ADD COLUMN \`parent_client_id\` CHAR(36) NULL DEFAULT NULL`); } catch {}

        // Seed default permissions
        await conn.query(`
          INSERT INTO ${db}.\`permissions\` (\`id\`, \`name\`, \`description\`) VALUES
          ('10000000-0000-4000-8000-000000000001', 'orders:create', 'Crear órdenes'),
          ('10000000-0000-4000-8000-000000000002', 'orders:read', 'Visualizar órdenes'),
          ('10000000-0000-4000-8000-000000000003', 'orders:update', 'Actualizar órdenes'),
          ('10000000-0000-4000-8000-000000000004', 'orders:delete', 'Eliminar órdenes'),
          ('10000000-0000-4000-8000-000000000005', 'invoices:read', 'Visualizar facturas'),
          ('10000000-0000-4000-8000-000000000006', 'invoices:export', 'Exportar facturas')
          ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`description\` = VALUES(\`description\`)
        `);

        // Seed default system roles
        await conn.query(`
          INSERT INTO ${db}.\`roles\` (\`id\`, \`name\`, \`client_id\`, \`is_system\`) VALUES
          ('11111111-1111-4111-8111-111111111111', 'admin', NULL, 1),
          ('22222222-2222-4222-8222-222222222222', 'staff', NULL, 1),
          ('33333333-3333-4333-8333-333333333333', 'driver', NULL, 1),
          ('44444444-4444-4444-8444-444444444444', 'client', NULL, 1),
          ('55555555-5555-4555-8555-555555555555', 'operator', NULL, 1)
          ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`is_system\` = VALUES(\`is_system\`)
        `);

        // Seed client system role permissions
        await conn.query(`
          INSERT IGNORE INTO ${db}.\`role_permissions\` (\`role_id\`, \`permission_id\`) VALUES
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000001'),
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000002'),
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000003'),
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000004'),
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000005'),
          ('44444444-4444-4444-8444-444444444444', '10000000-0000-4000-8000-000000000006')
        `);

        // Seed bootstrap users (Password: password123)
        await conn.query(`
          INSERT INTO ${db}.\`users\` (\`id\`, \`name\`, \`email\`, \`password_hash\`, \`role_id\`) VALUES
          ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'System Admin',  'admin@staycare.com',    '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '11111111-1111-4111-8111-111111111111'),
          ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Plant Staff',   'staff@staycare.com',    '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '22222222-2222-4222-8222-222222222222'),
          ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Main Driver',   'driver@staycare.com',   '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '33333333-3333-4333-8333-333333333333'),
          ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Test Client',   'client@staycare.com',   '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '44444444-4444-4444-8444-444444444444'),
          ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Main Operator', 'operator@staycare.com', '$2b$10$ASu3vm3RtjKb1iTyms64hOdeTET8BT5/OMwgjOyZVZxGo.1WJh94m', '55555555-5555-4555-8555-555555555555')
          ON DUPLICATE KEY UPDATE \`email\` = VALUES(\`email\`)
        `);

        // Seed client profile for test client user
        await conn.query(`
          INSERT INTO ${db}.\`client_profiles\` (\`id\`, \`user_id\`, \`contact_person\`, \`vat_number\`, \`billing_address\`) VALUES
          ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Test Client Contact', 'VAT12345678', '123 Business St, City')
          ON DUPLICATE KEY UPDATE \`vat_number\` = VALUES(\`vat_number\`)
        `);
      } catch (err) {
        console.warn("Could not sync permissions/roles/users seed data:", err);
      }

      return;
    }

    const schemaPath = await resolveSchemaPath();
    const rawSchema = await fs.readFile(schemaPath, "utf8");
    const schemaOnly = extractSchemaOnly(rawSchema);
    const normalizedSchema = normalizeSchemaSql(schemaOnly, config.db.database);
    await conn.query(normalizedSchema);

    console.log(`Development DB auto-init applied for schema '${config.db.database}'`);
  } finally {
    await conn.end();
  }
}
