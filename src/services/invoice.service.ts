import pool from "../db/pool";
import { InvoiceRepository } from "../repositories/invoice.repository";
import { OrderRepository } from "../repositories/order.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { OrderStatus } from "../types/orderStatus";

const generateInvoiceNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}-${rand}`;
};

export class InvoiceService {
  static async createInvoice(data: {
    client_id: number;
    order_ids: number[];
    due_date: string;
    line_items: {
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }[];
    subtotal: number;
    vat_percentage: number;
    vat_amount: number;
    total: number;
  }, userId: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const invoiceNumber = generateInvoiceNumber();
      const issueDate = new Date().toISOString().slice(0, 10);

      const invoiceId = await InvoiceRepository.insert(conn, {
        invoice_number: invoiceNumber,
        client_id: data.client_id,
        issue_date: issueDate,
        due_date: data.due_date,
        subtotal: data.subtotal,
        vat_percentage: data.vat_percentage,
        vat_amount: data.vat_amount,
        total: data.total,
        status: "pending",
      });

      // Insert line items
      for (const item of data.line_items) {
        await InvoiceRepository.insertLineItem(conn, {
          invoice_id: invoiceId,
          ...item,
        });
      }

      // Link orders and mark them as INVOICED
      for (const orderId of data.order_ids) {
        await InvoiceRepository.linkOrder(conn, invoiceId, orderId);
        await OrderRepository.update(orderId, { is_invoiced: true }, conn);
        await OrderRepository.insertHistory(conn, {
          order_id: orderId,
          changed_by_user_id: userId,
          is_system: false,
          status: OrderStatus.COMPLETED, // Suggestion: Use COMPLETED or keep current
          note: `Billed via invoice #${invoiceNumber}`,
        });
      }

      await conn.commit();
      return InvoiceRepository.findById(invoiceId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async getAllInvoices(
    filter: { status?: string; client_id?: number | string; from?: string; to?: string; search?: string | undefined },
    limit: number,
    offset: number
  ) {

    const [invoices, total] = await Promise.all([
      InvoiceRepository.findManyFiltered(filter, limit, offset),
      InvoiceRepository.countFiltered(filter),
    ]);
    return { invoices, total };
  }

  static async getInvoiceById(id: number | string) {
    const invoice = await InvoiceRepository.findById(id);
    if (!invoice) return null;
    return invoice;
  }

  /**
   * (Removed getClientIdForUser as it is no longer needed with the user_id standardization)
   */

  static async recordPayment(
    invoiceId: number,
    payment: {
      amount: number;
      method: "cash" | "bank_transfer" | "card";
      transaction_reference: string;
    },
    userId: number
  ) {
    const invoice = await InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    }
    if (invoice.status === "paid") {
      throw Object.assign(new Error("Invoice is already fully paid"), { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await InvoiceRepository.insertPayment(conn, {
        invoice_id: invoiceId,
        ...payment,
      });

      const totalPaid = await InvoiceRepository.sumPayments(invoiceId);

      if (totalPaid >= invoice.total) {
        await InvoiceRepository.updateStatus(invoiceId, "paid", conn);

        // Mark all linked orders as COMPLETED
        for (const order of invoice.orders) {
          await OrderRepository.update(order.id, { status: OrderStatus.COMPLETED }, conn);
          await OrderRepository.insertHistory(conn, {
            order_id: order.id,
            changed_by_user_id: userId,
            is_system: false,
            status: OrderStatus.COMPLETED,
            note: "Order completed (Invoice fully paid)",
          });
        }
      }

      await conn.commit();
      return InvoiceRepository.findById(invoiceId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async markOverdue(): Promise<number> {
    return InvoiceRepository.bulkMarkOverdue();
  }
}
