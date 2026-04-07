import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";

export interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  activeOrders: number;
  totalClients: number;
  totalDrivers: number;
  monthlyRevenue: number;
  monthlyVat: number;
}

export interface RevenueMonth {
  year: number;
  month: number;
  revenue: number;
  vat: number;
  invoiceCount: number;
}

export interface ClientStats {
  clientId: number;
  clientName: string;
  totalOrders: number;
  totalRevenue: number;
}

export interface OrderSlaHistory {
  id: number;
  service_type: string;
  created_at: Date;
  status: string;
  changed_at: Date;
}

export class ReportRepository {
  static async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const [ordersCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM orders"
    );
    const [todayCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM orders WHERE DATE(created_at) = ?",
      [today]
    );
    const [activeCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM orders WHERE status NOT IN ('Delivered', 'Completed')"
    );
    const [clientsCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'client'"
    );
    const [driversCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'driver' AND u.is_active = 1"
    );
    const [revenueData] = await pool.execute<RowDataPacket[]>(
      "SELECT SUM(total) as revenue, SUM(vat_amount) as vat FROM invoices WHERE status = 'paid' AND issue_date >= ?",
      [monthStartStr]
    );

    const oCount = ordersCount[0]?.total;
    const tCount = todayCount[0]?.total;
    const aCount = activeCount[0]?.total;
    const cCount = clientsCount[0]?.total;
    const dCount = driversCount[0]?.total;
    const rRevenue = revenueData[0]?.revenue;
    const rVat = revenueData[0]?.vat;

    return {
      totalOrders: Number(oCount) || 0,
      todayOrders: Number(tCount) || 0,
      activeOrders: Number(aCount) || 0,
      totalClients: Number(cCount) || 0,
      totalDrivers: Number(dCount) || 0,
      monthlyRevenue: Number(rRevenue) || 0,
      monthlyVat: Number(rVat) || 0,
    };
  }

  static async getRevenueByMonth(months: number): Promise<RevenueMonth[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        YEAR(issue_date) as year,
        MONTH(issue_date) as month,
        SUM(total) as revenue,
        SUM(vat_amount) as vat,
        COUNT(*) as count
      FROM invoices
      WHERE status = 'paid' AND issue_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      GROUP BY year, month
      ORDER BY year ASC, month ASC`,
      [months]
    );

    return rows.map((r) => ({
      year: r.year,
      month: r.month,
      revenue: Number(r.revenue),
      vat: Number(r.vat),
      invoiceCount: Number(r.count),
    }));
  }

  static async getTopClients(limit: number): Promise<ClientStats[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        u.id as clientId,
        u.name as clientName,
        COUNT(o.id) as totalOrders,
        SUM(IFNULL(o.total, 0)) as totalRevenue
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN orders o ON u.id = o.client_id
      WHERE r.name = 'client'
      GROUP BY u.id, u.name
      ORDER BY totalRevenue DESC
      LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      clientId: r.clientId,
      clientName: r.clientName || "Unknown",
      totalOrders: Number(r.totalOrders),
      totalRevenue: Number(r.totalRevenue),
    }));
  }

  static async getSlaData(): Promise<OrderSlaHistory[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        o.id,
        o.service_type,
        o.created_at,
        h.status,
        h.changed_at
      FROM orders o
      JOIN order_status_history h ON o.id = h.order_id
      WHERE o.status IN ('Delivered', 'Completed')
      ORDER BY o.id, h.changed_at ASC`
    );

    return rows.map((r) => ({
      id: r.id,
      service_type: r.service_type,
      created_at: new Date(r.created_at),
      status: r.status,
      changed_at: new Date(r.changed_at),
    }));
  }
}
