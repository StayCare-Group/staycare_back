import pool from "../db/pool";
import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise";

export interface IRouteRow extends RowDataPacket {
  id: number;
  route_date: Date;
  driver_id: number;
  area: string;
  status: "planned" | "in_progress" | "completed";
  created_at: Date;
  updated_at: Date;
}

export interface IRouteOrderRow extends RowDataPacket {
  route_id: number;
  order_id: number;
  position: number;
}

export class RouteRepository {
  static async findAll(filter: {
    status?: string;
    driver_id?: number;
    area?: string;
    date?: string;
    search?: string | undefined;
  }, limit: number, skip: number): Promise<{ routes: any[]; total: number }> {
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (filter.status) {
      whereClauses.push("r.status = ?");
      params.push(filter.status);
    }
    if (filter.driver_id) {
      whereClauses.push("r.driver_id = ?");
      params.push(filter.driver_id);
    }
    if (filter.area) {
      whereClauses.push("r.area = ?");
      params.push(filter.area);
    }
    if (filter.date) {
      whereClauses.push("r.route_date = ?");
      params.push(filter.date);
    }
    if (filter.search) {
      whereClauses.push("r.area LIKE ?");
      params.push(`%${filter.search}%`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [routes] = await pool.query<RowDataPacket[]>(
      `SELECT r.*, 
              u.name as driver_name, u.email as driver_email, u.phone as driver_phone
       FROM routes r
       JOIN users u ON r.driver_id = u.id
       ${whereStr}
       ORDER BY r.route_date DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, skip]
    );

    const [totalRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM routes r ${whereStr}`,
      params
    );


    return {
      routes: routes as any[],
      total: Number(totalRows[0]?.total) || 0,
    };
  }


  static async findById(id: number | string): Promise<any | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*, 
              u.name as driver_name, u.email as driver_email, u.phone as driver_phone
       FROM routes r
       JOIN users u ON r.driver_id = u.id
       WHERE r.id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const [orders] = await pool.execute<RowDataPacket[]>(
      `SELECT ro.order_id, ro.position, o.order_number, o.status,
              u.name as client_company, cp.contact_person as client_contact, u.phone as client_phone
       FROM route_orders ro
       JOIN orders o ON ro.order_id = o.id
       JOIN users u ON o.client_id = u.id
       LEFT JOIN client_profiles cp ON u.id = cp.user_id
       WHERE ro.route_id = ?
       ORDER BY ro.position ASC`,
      [id]
    );

    return {
      ...rows[0],
      orders: orders,
    };
  }

  static async insert(conn: PoolConnection, data: {
    route_date: string;
    driver_id: number;
    area: string;
    status?: string;
  }): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
      "INSERT INTO routes (route_date, driver_id, area, status) VALUES (?, ?, ?, ?)",
      [data.route_date, data.driver_id, data.area, data.status || "planned"]
    );
    return result.insertId;
  }

  static async update(id: number | string, data: Partial<{
    route_date: string;
    driver_id: number;
    area: string;
    status: string;
  }>): Promise<void> {
    const fields = Object.keys(data);
    if (fields.length === 0) return;

    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    const values = [...Object.values(data), id];

    await pool.execute(`UPDATE routes SET ${setClause} WHERE id = ?`, values);
  }

  static async delete(id: number | string): Promise<void> {
    // Note: ON DELETE CASCADE in MySQL handles route_orders cleanup
    await pool.execute("DELETE FROM routes WHERE id = ?", [id]);
  }

  static async assignOrder(conn: PoolConnection, routeId: number, orderId: number, position: number): Promise<void> {
    await conn.execute(
      "INSERT INTO route_orders (route_id, order_id, position) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE position = ?",
      [routeId, orderId, position, position]
    );
  }

  static async removeOrdersByRoute(conn: PoolConnection, routeId: number): Promise<void> {
    await conn.execute("DELETE FROM route_orders WHERE route_id = ?", [routeId]);
  }
}
