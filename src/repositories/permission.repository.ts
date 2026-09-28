import pool from "../db/pool";
import type { RowDataPacket } from "mysql2/promise";
import type { EntityId } from "../utils/id";

export interface IPermissionRow {
  id: EntityId;
  name: string;
  description?: string;
  created_at?: Date;
}

export class PermissionRepository {
  static async findAll(): Promise<IPermissionRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, description, created_at FROM permissions ORDER BY name ASC"
    );
    return rows as IPermissionRow[];
  }

  static async findByIds(ids: EntityId[]): Promise<IPermissionRow[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, description, created_at FROM permissions WHERE id IN (${placeholders})`,
      ids
    );
    return rows as IPermissionRow[];
  }

  static async findByNames(names: string[]): Promise<IPermissionRow[]> {
    if (names.length === 0) return [];
    const placeholders = names.map(() => "?").join(",");
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, description, created_at FROM permissions WHERE name IN (${placeholders})`,
      names
    );
    return rows as IPermissionRow[];
  }
}
