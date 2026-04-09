import pool from "../db/pool";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { generateEntityId, type EntityId } from "../utils/id";

export type InvoiceStatus = "pending" | "paid" | "overdue";

export interface IInvoiceMySQL {
  id: EntityId;
  invoice_number: string;
  client_id: EntityId;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat_percentage: number;
  vat_amount: number;
  total: number;
  status: InvoiceStatus;
  created_at: Date;
  updated_at: Date;
  // Populated via JOIN
  client_name?: string;
  contact_person?: string;
}

export interface IInvoiceLineItemMySQL {
  id: EntityId;
  invoice_id: EntityId;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface IInvoicePaymentMySQL {
  id: EntityId;
  invoice_id: EntityId;
  amount: number;
  method: "cash" | "bank_transfer" | "card";
  transaction_reference: string;
  paid_at: Date;
}

export class InvoiceRepository {
  // ─── Base find helpers ─────────────────────────────────────────────────────

  static async findById(id: EntityId): Promise<
    (IInvoiceMySQL & {
      line_items: IInvoiceLineItemMySQL[];
      payments: IInvoicePaymentMySQL[];
      orders: { id: EntityId; order_number: string; status: string }[];
    }) | null
  > {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT i.*,
              i.client_id AS client,
              u.name AS client_name,
              cp.contact_person
       FROM invoices i
       INNER JOIN users u ON i.client_id = u.id
       LEFT JOIN client_profiles cp ON cp.user_id = u.id
       WHERE i.id = ? LIMIT 1`,
      [id]
    );
    if (!rows[0]) return null;

    const invoice = rows[0] as IInvoiceMySQL;
    const [lineItems, payments, orders] = await Promise.all([
      InvoiceRepository.findLineItems(id),
      InvoiceRepository.findPayments(id),
      InvoiceRepository.findOrders(id),
    ]);

    return { ...invoice, line_items: lineItems, payments, orders };
  }

  static async findLineItems(invoiceId: EntityId): Promise<IInvoiceLineItemMySQL[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM invoice_line_items WHERE invoice_id = ?`,
      [invoiceId]
    );
    return rows as IInvoiceLineItemMySQL[];
  }

  static async findPayments(invoiceId: EntityId): Promise<IInvoicePaymentMySQL[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at ASC`,
      [invoiceId]
    );
    return rows as IInvoicePaymentMySQL[];
  }

  static async findOrders(invoiceId: EntityId): Promise<{ id: EntityId; order_number: string; status: string }[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT o.id, o.order_number, o.status
       FROM orders o
       INNER JOIN invoice_orders io ON io.order_id = o.id
       WHERE io.invoice_id = ?`,
      [invoiceId]
    );
    return rows as any[];
  }

  // ─── Insert ────────────────────────────────────────────────────────────────

  static async insert(
    conn: PoolConnection,
    data: Omit<IInvoiceMySQL, "id" | "created_at" | "updated_at" | "client_name" | "contact_person">
  ): Promise<EntityId> {
    const id = generateEntityId();
    await conn.execute(
      `INSERT INTO invoices (id, invoice_number, client_id, issue_date, due_date, subtotal, vat_percentage, vat_amount, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.invoice_number,
        data.client_id,
        data.issue_date,
        data.due_date,
        data.subtotal,
        data.vat_percentage,
        data.vat_amount,
        data.total,
        data.status,
      ]
    );
    return id;
  }

  static async insertLineItem(
    conn: PoolConnection,
    item: Omit<IInvoiceLineItemMySQL, "id">
  ): Promise<void> {
    const id = generateEntityId();
    await conn.execute(
      `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, item.invoice_id, item.description, item.quantity, item.unit_price, item.total_price]
    );
  }

  static async linkOrder(conn: PoolConnection, invoiceId: EntityId, orderId: EntityId): Promise<void> {
    await conn.execute(
      `INSERT IGNORE INTO invoice_orders (invoice_id, order_id) VALUES (?, ?)`,
      [invoiceId, orderId]
    );
  }

  static async insertPayment(
    conn: PoolConnection,
    payment: Omit<IInvoicePaymentMySQL, "id" | "paid_at">
  ): Promise<EntityId> {
    const id = generateEntityId();
    await conn.execute(
      `INSERT INTO invoice_payments (id, invoice_id, amount, method, transaction_reference)
       VALUES (?, ?, ?, ?, ?)`,
      [id, payment.invoice_id, payment.amount, payment.method, payment.transaction_reference]
    );
    return id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  static async updateStatus(
    id: EntityId,
    status: InvoiceStatus,
    conn?: PoolConnection
  ): Promise<void> {
    const exec = conn ?? pool;
    await exec.execute(`UPDATE invoices SET status = ? WHERE id = ?`, [status, id]);
  }

  // ─── Filtered list ─────────────────────────────────────────────────────────

  static async findManyFiltered(
    filter: { status?: string; client_id?: EntityId | undefined; from?: string; to?: string; search?: string | undefined },
    limit: number,
    offset: number
  ): Promise<IInvoiceMySQL[]> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.status) {
      where += " AND i.status = ?";
      params.push(filter.status);
    }
    if (filter.client_id) {
      where += " AND i.client_id = ?";
      params.push(filter.client_id);
    }
    if (filter.from) {
      where += " AND i.issue_date >= ?";
      params.push(filter.from);
    }
    if (filter.to) {
      where += " AND i.issue_date <= ?";
      params.push(filter.to);
    }
    if (filter.search) {
      where += " AND (i.invoice_number LIKE ? OR cp.contact_person LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern);
    }

    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT i.*,
              i.client_id AS client,
              u.name AS client_name,
              cp.contact_person,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', o.id, 'order_number', o.order_number, 'status', o.status)) 
               FROM orders o 
               INNER JOIN invoice_orders io ON io.order_id = o.id 
               WHERE io.invoice_id = i.id) AS orders
       FROM invoices i
       INNER JOIN users u ON i.client_id = u.id
       LEFT JOIN client_profiles cp ON cp.user_id = u.id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    return rows as IInvoiceMySQL[];
  }

  static async countFiltered(
    filter: { status?: string; client_id?: EntityId | undefined; from?: string; to?: string; search?: string | undefined }
  ): Promise<number> {
    let where = "1=1";
    const params: any[] = [];

    if (filter.status) {
      where += " AND i.status = ?";
      params.push(filter.status);
    }
    if (filter.client_id) {
      where += " AND i.client_id = ?";
      params.push(filter.client_id);
    }
    if (filter.from) {
      where += " AND i.issue_date >= ?";
      params.push(filter.from);
    }
    if (filter.to) {
      where += " AND i.issue_date <= ?";
      params.push(filter.to);
    }
    if (filter.search) {
      where += " AND (i.invoice_number LIKE ? OR cp.contact_person LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM invoices i 
       INNER JOIN users u ON i.client_id = u.id 
       WHERE ${where}`,
      params
    );

    return Number((rows[0] as { total: number }).total) || 0;
  }

  /** Suma total pagado de una factura */
  static async sumPayments(invoiceId: EntityId): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = ?`,
      [invoiceId]
    );
    return Number((rows[0] as { paid: number }).paid) || 0;
  }

  /** Marca como overdue las facturas pending vencidas */
  static async bulkMarkOverdue(): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE invoices SET status = 'overdue'
       WHERE status = 'pending' AND due_date < CURDATE()`
    );
    return result.affectedRows;
  }
}
