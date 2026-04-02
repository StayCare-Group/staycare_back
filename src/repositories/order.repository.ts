import { OrderStatus } from "../types/orderStatus";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "../db/pool";

function toDbOrderStatus(status: unknown): string | any {
  if (typeof status !== "string") return status;
  const normalized = status.trim().toLowerCase();
  const map: Record<string, string> = {
    pending: "Pending",
    assigned: "Assigned",
    transit: "Transit",
    arrived: "Arrived",
    washing: "Washing",
    drying: "Drying",
    ironing: "Ironing",
    quality_check: "QualityCheck",
    ready_to_delivery: "ReadyToDeliver",
    collected: "Collected",
    delivered: "Delivered",
    invoiced: "Invoiced",
    completed: "Completed",
  };
  return map[normalized] ?? status;
}

export interface IOrderMySQL {
  id: number;
  order_number: string;
  client_id: number;
  property_id: number | null;
  driver_id: number | null;
  service_type: "standard" | "express";
  pickup_date: Date;
  pickup_window_start: Date;
  pickup_window_end: Date;
  estimated_bags: number | null;
  actual_bags: number | null;
  staff_confirmed_bags: number | null;
  special_notes: string | null;
  status: OrderStatus;
  subtotal: number;
  vat_percentage: number;
  vat_amount: number;
  total: number;
  created_at: Date;
  updated_at: Date;
  property_address?: string;
  property_area?: string;
}

export interface IOrderItemMySQL {
  id: number;
  order_id: number;
  item_id: number | null;
  item_code_snapshot: string;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  qty_good: number;
  qty_bad: number;
  qty_stained: number;
}

export interface IOrderStatusHistoryMySQL {
  id: number;
  order_id: number;
  changed_by_user_id: number | null;
  is_system: boolean;
  status: string;
  note: string | null;
  changed_at: Date;
}

export class OrderRepository {
  static async findById(id: number | string): Promise<(IOrderMySQL & { client_name?: string; driver_name?: string; property_name?: string }) | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT o.*, 
              u.name as client_name,
              du.name as driver_name,
              p.property_name,
              p.address as property_address,
              p.area as property_area
       FROM orders o
       INNER JOIN users u ON o.client_id = u.id
       LEFT JOIN users du ON o.driver_id = du.id
       LEFT JOIN properties p ON o.property_id = p.id
       WHERE o.id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as IOrderMySQL) || null;
  }

  static async findItemsByOrderId(orderId: number | string): Promise<IOrderItemMySQL[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM order_items WHERE order_id = ?`,
      [orderId]
    );
    return rows as IOrderItemMySQL[];
  }

  static async findHistoryByOrderId(orderId: number | string): Promise<IOrderStatusHistoryMySQL[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at ASC`,
      [orderId]
    );
    return rows as IOrderStatusHistoryMySQL[];
  }

  static async insert(conn: PoolConnection, data: Omit<IOrderMySQL, "id" | "created_at" | "updated_at">): Promise<number> {
    const dbStatus = toDbOrderStatus(data.status);
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO orders (
        order_number, client_id, property_id, driver_id, service_type, 
        pickup_date, pickup_window_start, pickup_window_end, 
        estimated_bags, actual_bags, staff_confirmed_bags, special_notes, status, 
        subtotal, vat_percentage, vat_amount, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.order_number, data.client_id, data.property_id, data.driver_id, data.service_type,
        data.pickup_date, data.pickup_window_start, data.pickup_window_end,
        data.estimated_bags, data.actual_bags, data.staff_confirmed_bags, data.special_notes, dbStatus,
        data.subtotal, data.vat_percentage, data.vat_amount, data.total
      ]
    );
    return result.insertId;
  }

  static async deleteItemsByOrderId(conn: PoolConnection, orderId: number): Promise<void> {
    await conn.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]);
  }

  static async insertItem(conn: PoolConnection, item: Omit<IOrderItemMySQL, "id">): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO order_items (
        order_id, item_id, item_code_snapshot, name_snapshot, quantity, unit_price, total_price,
        qty_good, qty_bad, qty_stained
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.order_id, item.item_id, item.item_code_snapshot, item.name_snapshot,
        item.quantity, item.unit_price, item.total_price,
        item.qty_good || 0, item.qty_bad || 0, item.qty_stained || 0
      ]
    );
    return result.insertId;
  }

  static async updateItem(conn: PoolConnection | null, id: number, data: Partial<IOrderItemMySQL>): Promise<void> {
    const entries = Object.entries(data).filter(([k]) => k !== "id");
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    values.push(id);

    const exec = conn || pool;
    await exec.execute(`UPDATE order_items SET ${setClause} WHERE id = ?`, values);
  }

  static async insertHistory(conn: PoolConnection, history: Omit<IOrderStatusHistoryMySQL, "id" | "changed_at">): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO order_status_history (
        order_id, changed_by_user_id, is_system, status, note
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        history.order_id, history.changed_by_user_id, history.is_system ? 1 : 0, history.status, history.note
      ]
    );
    return result.insertId;
  }

  static async update(id: number | string, data: Partial<IOrderMySQL>, conn?: PoolConnection): Promise<void> {
    const nextData: Partial<IOrderMySQL> = { ...data };
    if (nextData.status) {
      nextData.status = toDbOrderStatus(nextData.status) as OrderStatus;
    }

    const entries = Object.entries(nextData).filter(([k]) => k !== "id");
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    values.push(id);

    const exec = conn || pool;
    await exec.execute(`UPDATE orders SET ${setClause} WHERE id = ?`, values);
  }

  static async delete(id: number | string, conn?: PoolConnection): Promise<void> {
    const exec = conn || pool;
    await exec.execute(`DELETE FROM orders WHERE id = ?`, [id]);
  }

  static async countFiltered(filter: any): Promise<number> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => "?").join(", ");
        where += ` AND o.status IN (${placeholders})`;
        params.push(...filter.status);
      } else {
        where += " AND o.status = ?";
        params.push(filter.status);
      }
    }
    if (filter.client_id) {
      where += " AND o.client_id = ?";
      params.push(filter.client_id);
    }
    if (filter.driver_id) {
      where += " AND o.driver_id = ?";
      params.push(filter.driver_id);
    }
    if (filter.service_type) {
      where += " AND o.service_type = ?";
      params.push(filter.service_type);
    }
    if (filter.from) {
      where += " AND o.created_at >= ?";
      params.push(filter.from);
    }
    if (filter.to) {
      where += " AND o.created_at <= ?";
      params.push(filter.to);
    }
    if (filter.pickup_from) {
      where += " AND o.pickup_date >= ?";
      params.push(filter.pickup_from);
    }
    if (filter.pickup_to) {
      where += " AND o.pickup_date <= ?";
      params.push(filter.pickup_to);
    }
    if (filter.search) {
      where += " AND (o.order_number LIKE ? OR u.name LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM orders o 
       INNER JOIN users u ON o.client_id = u.id 
       WHERE ${where}`,
      params
    );

    return (rows[0] as { total: number }).total;
  }

  static async findManyFiltered(filter: any, limit: number, offset: number): Promise<any[]> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => "?").join(", ");
        where += ` AND o.status IN (${placeholders})`;
        params.push(...filter.status);
      } else {
        where += " AND o.status = ?";
        params.push(filter.status);
      }
    }
    if (filter.client_id) {
      where += " AND o.client_id = ?";
      params.push(filter.client_id);
    }
    if (filter.driver_id) {
      where += " AND o.driver_id = ?";
      params.push(filter.driver_id);
    }
    if (filter.service_type) {
      where += " AND o.service_type = ?";
      params.push(filter.service_type);
    }
    if (filter.from) {
      where += " AND o.created_at >= ?";
      params.push(filter.from);
    }
    if (filter.to) {
      where += " AND o.created_at <= ?";
      params.push(filter.to);
    }
    if (filter.pickup_from) {
      where += " AND o.pickup_date >= ?";
      params.push(filter.pickup_from);
    }
    if (filter.pickup_to) {
      where += " AND o.pickup_date <= ?";
      params.push(filter.pickup_to);
    }
    if (filter.search) {
      where += " AND (o.order_number LIKE ? OR u.name LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern);
    }

    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.*, 
              u.name as client_name,
              du.name as driver_name,
              p.property_name,
              p.address as property_address,
              p.area as property_area
       FROM orders o
       INNER JOIN users u ON o.client_id = u.id
       LEFT JOIN users du ON o.driver_id = du.id
       LEFT JOIN properties p ON o.property_id = p.id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );


    return rows;
  }

  static async existsByPropertyId(propertyId: number): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM orders WHERE property_id = ? LIMIT 1`,
      [propertyId]
    );
    return rows.length > 0;
  }
}
