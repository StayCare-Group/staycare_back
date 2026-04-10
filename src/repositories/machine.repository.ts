import pool from "../db/pool";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { generateEntityId, type EntityId } from "../utils/id";

export type MachineType = "washer" | "dryer" | "iron";
export type MachineStatus = "available" | "running" | "maintenance";

export interface IMachineMySQL {
  id: EntityId;
  name: string;
  type: MachineType;
  capacity: number;           // kg — DECIMAL(6,2) en BD
  status: MachineStatus;
  current_order_id: EntityId | null;
  started_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Populated via JOIN
  order_number?: string;
  order_status?: string;
}

export class MachineRepository {
  // ─── Read ──────────────────────────────────────────────────────────────────

  static async findAll(
    limit: number,
    offset: number,
    filter: { search?: string | undefined; type?: MachineType | undefined; status?: MachineStatus | undefined } = {}
  ): Promise<IMachineMySQL[]> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.search) {
      where += " AND m.name LIKE ?";
      params.push(`%${filter.search}%`);
    }
    if (filter.type) {
      where += " AND m.type = ?";
      params.push(filter.type);
    }
    if (filter.status) {
      where += " AND m.status = ?";
      params.push(filter.status);
    }

    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.*,
              o.order_number,
              o.status AS order_status
       FROM machines m
       LEFT JOIN orders o ON m.current_order_id = o.id
       WHERE ${where}
       ORDER BY m.type ASC, m.name ASC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows as IMachineMySQL[];
  }

  static async findById(id: EntityId): Promise<IMachineMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.*,
              o.order_number,
              o.status AS order_status
       FROM machines m
       LEFT JOIN orders o ON m.current_order_id = o.id
       WHERE m.id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as IMachineMySQL) || null;
  }

  static async countAll(
    filter: { search?: string | undefined; type?: MachineType | undefined; status?: MachineStatus | undefined } = {}
  ): Promise<number> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.search) {
      where += " AND name LIKE ?";
      params.push(`%${filter.search}%`);
    }
    if (filter.type) {
      where += " AND type = ?";
      params.push(filter.type);
    }
    if (filter.status) {
      where += " AND status = ?";
      params.push(filter.status);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM machines WHERE ${where}`,
      params
    );
    return Number((rows[0] as { total: number }).total) || 0;
  }

  // ─── Insert ────────────────────────────────────────────────────────────────

  static async insert(
    conn: PoolConnection,
    data: { name: string; type: MachineType; capacity: number }
  ): Promise<EntityId> {
    const id = generateEntityId();
    await conn.execute(
      `INSERT INTO machines (id, name, type, capacity) VALUES (?, ?, ?, ?)`,
      [id, data.name, data.type, data.capacity]
    );
    return id;
  }

  static async bulkInsert(
    conn: PoolConnection,
    machines: { name: string; type: MachineType; capacity: number }[]
  ): Promise<void> {
    for (const m of machines) {
      const id = generateEntityId();
      await conn.execute(
        `INSERT IGNORE INTO machines (id, name, type, capacity) VALUES (?, ?, ?, ?)`,
        [id, m.name, m.type, m.capacity]
      );
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async update(
    id: EntityId,
    data: Partial<Pick<IMachineMySQL, "name" | "type" | "capacity" | "status" | "current_order_id" | "started_at">>
  ): Promise<void> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    values.push(id);

    await pool.execute(`UPDATE machines SET ${setClause} WHERE id = ?`, values);
  }

  static async assign(id: EntityId, orderId: EntityId): Promise<void> {
    await pool.execute(
      `UPDATE machines SET status = 'running', current_order_id = ?, started_at = NOW() WHERE id = ?`,
      [orderId, id]
    );
  }

  static async release(id: EntityId): Promise<void> {
    await pool.execute(
      `UPDATE machines SET status = 'available', current_order_id = NULL, started_at = NULL WHERE id = ?`,
      [id]
    );
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async delete(id: EntityId): Promise<void> {
    await pool.execute(`DELETE FROM machines WHERE id = ?`, [id]);
  }
}
