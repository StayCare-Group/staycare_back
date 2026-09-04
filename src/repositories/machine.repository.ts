import pool from "../db/pool";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { generateEntityId, type EntityId } from "../utils/id";
import { fromDbOrderStatus } from "./order.repository";

export type MachineType = "washer" | "dryer" | "iron";
export type MachineStatus = "available" | "running" | "maintenance";

export interface IMachineOrderAssignment {
  id: EntityId;
  order_id: EntityId;
  order_number: string;
  order_status: string;
  client_name?: string;
  assigned_at: Date;
}

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
  // Populated via JOIN / machine_orders
  order_number?: string;
  order_status?: string;
  current_orders?: IMachineOrderAssignment[];
}

export class MachineRepository {
  // ─── Private Helper ────────────────────────────────────────────────────────

  private static async populateMachineOrders(machines: IMachineMySQL[]): Promise<IMachineMySQL[]> {
    if (machines.length === 0) return machines;

    const machineIds = machines.map((m) => m.id);
    const placeholders = machineIds.map(() => "?").join(",");

    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT mo.id,
                mo.machine_id,
                mo.order_id,
                mo.assigned_at,
                o.order_number,
                o.status AS order_status,
                u.name AS client_name
         FROM machine_orders mo
         INNER JOIN orders o ON mo.order_id = o.id
         LEFT JOIN users u ON o.client_id = u.id
         WHERE mo.machine_id IN (${placeholders})
         ORDER BY mo.assigned_at ASC`,
        machineIds
      );

      const ordersByMachine: Record<string, IMachineOrderAssignment[]> = {};
      for (const row of rows as any[]) {
        const machineId = String(row.machine_id);
        const list = ordersByMachine[machineId] ?? [];
        list.push({
          id: row.id,
          order_id: row.order_id,
          order_number: row.order_number,
          order_status: fromDbOrderStatus(row.order_status),
          client_name: row.client_name || undefined,
          assigned_at: row.assigned_at,
        });
        ordersByMachine[machineId] = list;
      }

      for (const machine of machines) {
        const assigned = ordersByMachine[machine.id] || [];
        machine.current_orders = assigned;
        const firstOrder = assigned[0];
        if (firstOrder) {
          machine.current_order_id = firstOrder.order_id;
          machine.order_number = firstOrder.order_number;
          machine.order_status = firstOrder.order_status;
        } else {
          machine.current_orders = [];
        }
      }
    } catch {
      // Si la tabla machine_orders aún no existe en algún entorno legacy, fallback gracefully
      for (const machine of machines) {
        if (machine.current_order_id) {
          machine.current_orders = [
            {
              id: machine.current_order_id,
              order_id: machine.current_order_id,
              order_number: machine.order_number || "",
              order_status: machine.order_status || "",
              assigned_at: machine.started_at || new Date(),
            },
          ];
        } else {
          machine.current_orders = [];
        }
      }
    }

    return machines;
  }

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

    const machines = (rows as any[]).map((row) => ({
      ...row,
      order_status: row.order_status ? fromDbOrderStatus(row.order_status) : undefined,
    })) as IMachineMySQL[];

    return this.populateMachineOrders(machines);
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
    if (!rows[0]) return null;

    const machine = {
      ...(rows[0] as any),
      order_status: rows[0].order_status ? fromDbOrderStatus(rows[0].order_status) : undefined,
    } as IMachineMySQL;

    const populated = await this.populateMachineOrders([machine]);
    return populated[0] || null;
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

  static async findByOrderId(orderId: EntityId): Promise<IMachineMySQL | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT m.*
         FROM machines m
         INNER JOIN machine_orders mo ON m.id = mo.machine_id
         WHERE mo.order_id = ?
         LIMIT 1`,
        [orderId]
      );
      if (rows[0]) {
        const populated = await this.populateMachineOrders([rows[0] as IMachineMySQL]);
        return populated[0] || null;
      }
    } catch {
      // fallback si machine_orders no estuviera lista
    }

    const [legacy] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM machines WHERE current_order_id = ? LIMIT 1`,
      [orderId]
    );
    if (!legacy[0]) return null;
    const populated = await this.populateMachineOrders([legacy[0] as IMachineMySQL]);
    return populated[0] || null;
  }

  // ─── Insert ────────────────────────────────────────────────────────────────

  static async insert(
    conn: PoolConnection,
    data: { name: string; type: MachineType; capacity: number; status?: MachineStatus }
  ): Promise<EntityId> {
    const id = generateEntityId();
    const status = data.status || "available";
    await conn.execute(
      `INSERT INTO machines (id, name, type, capacity, status) VALUES (?, ?, ?, ?, ?)`,
      [id, data.name, data.type, data.capacity, status]
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

  static async assign(id: EntityId, orderId: EntityId, conn?: PoolConnection): Promise<void> {
    const exec = conn || pool;
    const assignmentId = generateEntityId();

    try {
      await exec.execute(
        `INSERT INTO machine_orders (id, machine_id, order_id, assigned_at) 
         VALUES (?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE assigned_at = NOW()`,
        [assignmentId, id, orderId]
      );
    } catch {
      // Ignorar si la tabla machine_orders no estuviera lista
    }

    await exec.execute(
      `UPDATE machines SET status = 'running', current_order_id = ?, started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
      [orderId, id]
    );
  }

  static async releaseOrder(machineId: EntityId, orderId: EntityId, conn?: PoolConnection): Promise<void> {
    const exec = conn || pool;

    try {
      await exec.execute(
        `DELETE FROM machine_orders WHERE machine_id = ? AND order_id = ?`,
        [machineId, orderId]
      );

      const [rows] = await exec.execute<RowDataPacket[]>(
        `SELECT order_id FROM machine_orders WHERE machine_id = ? ORDER BY assigned_at DESC`,
        [machineId]
      );

      const firstActive = rows[0] as { order_id: string } | undefined;
      if (!firstActive) {
        await exec.execute(
          `UPDATE machines SET status = 'available', current_order_id = NULL, started_at = NULL WHERE id = ?`,
          [machineId]
        );
      } else {
        await exec.execute(
          `UPDATE machines SET current_order_id = ? WHERE id = ?`,
          [firstActive.order_id, machineId]
        );
      }
    } catch {
      // Fallback legacy
      await exec.execute(
        `UPDATE machines SET status = 'available', current_order_id = NULL, started_at = NULL WHERE id = ? AND current_order_id = ?`,
        [machineId, orderId]
      );
    }
  }

  static async release(id: EntityId, conn?: PoolConnection): Promise<void> {
    const exec = conn || pool;
    try {
      await exec.execute(`DELETE FROM machine_orders WHERE machine_id = ?`, [id]);
    } catch {
      // fallback
    }
    await exec.execute(
      `UPDATE machines SET status = 'available', current_order_id = NULL, started_at = NULL WHERE id = ?`,
      [id]
    );
  }

  static async releaseOrderByOrderId(orderId: EntityId, conn?: PoolConnection): Promise<void> {
    const exec = conn || pool;
    try {
      const [assigned] = await exec.execute<RowDataPacket[]>(
        `SELECT machine_id FROM machine_orders WHERE order_id = ?`,
        [orderId]
      );
      if (assigned.length > 0) {
        for (const row of assigned) {
          await this.releaseOrder(row.machine_id, orderId, conn);
        }
        return;
      }
    } catch {
      // fallback
    }

    await exec.execute(
      `UPDATE machines SET status = 'available', current_order_id = NULL, started_at = NULL WHERE current_order_id = ?`,
      [orderId]
    );
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  static async delete(id: EntityId): Promise<void> {
    await pool.execute(`DELETE FROM machines WHERE id = ?`, [id]);
  }
}
