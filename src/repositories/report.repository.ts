import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";
import { toDbOrderStatus, fromDbOrderStatus } from "./order.repository";
import { OrderStatus, REPORT_EXCLUDED_ORDER_STATUSES } from "../types/orderStatus";

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
  clientId: string;
  clientName: string;
  totalOrders: number;
  totalRevenue: number;
}

export interface RawDashboardAlertRow {
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  status: string;
  referenceDate: Date;
}

export interface OrderSlaHistory {
  id: string;
  service_type: string;
  created_at: Date;
  status: string;
  changed_at: Date;
}

export interface DashboardOverviewFilters {
  /** Inclusive start instant (UTC). */
  start: Date;
  /** Exclusive end instant (UTC). */
  endExclusive: Date;
  clientId?: string | undefined;
}

export interface DashboardConditionCounts {
  good: number;
  bad: number;
  stained: number;
}

export interface DashboardStatusBreakdowns {
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  itemsByStatus: Partial<Record<OrderStatus, number>>;
  conditionsByStatus?: Partial<Record<OrderStatus, DashboardConditionCounts>>;
}

export interface DashboardHourlyOrderCount {
  /** UTC hour bucket formatted as `YYYY-MM-DD HH:00:00`. */
  hourUtc: string;
  orderCount: number;
}

function buildDashboardOrdersFilter(filters: DashboardOverviewFilters): {
  where: string;
  params: unknown[];
} {
  const excludedStatuses = REPORT_EXCLUDED_ORDER_STATUSES.map(toDbOrderStatus);
  const params: unknown[] = [filters.start, filters.endExclusive, ...excludedStatuses];

  let where = `o.created_at >= ? AND o.created_at < ?
        AND o.status NOT IN (${excludedStatuses.map(() => "?").join(", ")})`;

  if (filters.clientId) {
    where += " AND o.client_id = ?";
    params.push(filters.clientId);
  }

  return { where, params };
}

export class ReportRepository {
  /**
   * Orders created in `[start, endExclusive)` and the sum of their item quantities,
   * grouped by `orders.status`. Excluded statuses (cancelled) are left out.
   * Runs two focused queries in parallel so counting orders never multiplies rows
   * across `order_items` or requires `COUNT(DISTINCT)`, while returning at most
   * one row per status so business groupings live in the service layer.
   */
  static async getDashboardStatusBreakdowns(
    filters: DashboardOverviewFilters
  ): Promise<DashboardStatusBreakdowns> {
    const { where, params } = buildDashboardOrdersFilter(filters);

    const [[orderRows], [itemRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT o.status AS status, COUNT(*) AS orderCount
         FROM orders o
         WHERE ${where}
         GROUP BY o.status`,
        params
      ),
      pool.query<RowDataPacket[]>(
        `SELECT o.status AS status,
                COALESCE(SUM(oi.quantity), 0) AS itemCount,
                COALESCE(SUM(oi.qty_good), 0) AS qtyGood,
                COALESCE(SUM(oi.qty_bad), 0) AS qtyBad,
                COALESCE(SUM(oi.qty_stained), 0) AS qtyStained
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         WHERE ${where}
         GROUP BY o.status`,
        params
      ),
    ]);

    const ordersByStatus: Partial<Record<OrderStatus, number>> = {};
    for (const row of orderRows) {
      const status = fromDbOrderStatus(String(row.status)) as OrderStatus;
      ordersByStatus[status] = (ordersByStatus[status] ?? 0) + (Number(row.orderCount) || 0);
    }

    const itemsByStatus: Partial<Record<OrderStatus, number>> = {};
    const conditionsByStatus: Partial<Record<OrderStatus, DashboardConditionCounts>> = {};
    for (const row of itemRows) {
      const status = fromDbOrderStatus(String(row.status)) as OrderStatus;
      itemsByStatus[status] = (itemsByStatus[status] ?? 0) + (Number(row.itemCount) || 0);
      const prev = conditionsByStatus[status] ?? { good: 0, bad: 0, stained: 0 };
      conditionsByStatus[status] = {
        good: prev.good + (Number(row.qtyGood) || 0),
        bad: prev.bad + (Number(row.qtyBad) || 0),
        stained: prev.stained + (Number(row.qtyStained) || 0),
      };
    }

    return { ordersByStatus, itemsByStatus, conditionsByStatus };
  }

  /**
   * Counts non-cancelled orders in `[start, endExclusive)` grouped by UTC hour.
   * The service layer maps each UTC hour into its `Europe/Malta` calendar day or month.
   */
  static async getDashboardOrdersByHour(
    filters: DashboardOverviewFilters
  ): Promise<DashboardHourlyOrderCount[]> {
    const { where, params } = buildDashboardOrdersFilter(filters);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d %H:00:00') AS hourUtc, COUNT(*) AS orderCount
       FROM orders o
       WHERE ${where}
       GROUP BY hourUtc
       ORDER BY hourUtc ASC`,
      params
    );

    return rows.map((row) => ({
      hourUtc: String(row.hourUtc),
      orderCount: Number(row.orderCount) || 0,
    }));
  }

  static async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const [ordersCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM orders"
    );
    const [todayCount] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM orders WHERE (created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)) OR pickup_date = ?",
      [today, today, today]
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
    const safeLimit = Math.max(1, Number(limit) || 20);
    const [rows] = await pool.query<RowDataPacket[]>(
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
      [safeLimit]
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

  static async getDashboardOverduePickups(
    thresholdDate: Date,
    clientId?: string
  ): Promise<RawDashboardAlertRow[]> {
    let query = `
      SELECT
        o.id AS orderId,
        o.order_number AS orderNumber,
        o.client_id AS clientId,
        u.name AS clientName,
        o.status,
        o.pickup_window_end AS referenceDate
      FROM orders o
      JOIN users u ON o.client_id = u.id
      WHERE o.status IN ('Pending', 'Assigned', 'Rescheduled')
        AND o.pickup_window_end < ?
    `;
    const params: any[] = [thresholdDate];
    if (clientId) {
      query += ` AND o.client_id = ?`;
      params.push(clientId);
    }
    query += ` ORDER BY o.pickup_window_end ASC`;

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map((r) => ({
      orderId: String(r.orderId),
      orderNumber: String(r.orderNumber),
      clientId: String(r.clientId),
      clientName: String(r.clientName || "Unknown"),
      status: String(r.status),
      referenceDate: new Date(r.referenceDate),
    }));
  }

  static async getDashboardStalledOrders(
    thresholdDate: Date,
    clientId?: string
  ): Promise<RawDashboardAlertRow[]> {
    let query = `
      SELECT
        o.id AS orderId,
        o.order_number AS orderNumber,
        o.client_id AS clientId,
        u.name AS clientName,
        o.status,
        o.updated_at AS referenceDate
      FROM orders o
      JOIN users u ON o.client_id = u.id
      WHERE o.status IN ('Transit', 'Arrived', 'Washing', 'Drying', 'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected')
        AND o.updated_at < ?
    `;
    const params: any[] = [thresholdDate];
    if (clientId) {
      query += ` AND o.client_id = ?`;
      params.push(clientId);
    }
    query += ` ORDER BY o.updated_at ASC`;

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map((r) => ({
      orderId: String(r.orderId),
      orderNumber: String(r.orderNumber),
      clientId: String(r.clientId),
      clientName: String(r.clientName || "Unknown"),
      status: String(r.status),
      referenceDate: new Date(r.referenceDate),
    }));
  }

  /**
   * Sums the `total` of all invoices issued within `[from, to]` inclusive.
   * `from` and `to` are `YYYY-MM-DD` strings matching `invoices.issue_date`.
   */
  static async getDashboardInvoicedTotal(
    from: string,
    to: string,
    clientId?: string
  ): Promise<number> {
    let query = `
      SELECT COALESCE(SUM(total), 0) AS totalInvoiced
      FROM invoices
      WHERE issue_date >= ? AND issue_date <= ?
    `;
    const params: unknown[] = [from, to];
    if (clientId) {
      query += ` AND client_id = ?`;
      params.push(clientId);
    }

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return Number(rows[0]?.totalInvoiced) || 0;
  }
}
