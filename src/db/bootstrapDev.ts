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
