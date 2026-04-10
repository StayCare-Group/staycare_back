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
      console.log(`Development DB already initialized (${tableCount} tables found), skipping schema init.`);
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
