import pool from "../db/pool";
import { InvoiceRepository } from "../repositories/invoice.repository";
import { OrderRepository } from "../repositories/order.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { OrderStatus } from "../types/orderStatus";
import { AppError } from "../utils/AppError";
import { LineItemInput } from "../validation/invoice.validation";
import type { EntityId } from "../utils/id";

const generateInvoiceNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}-${rand}`;
};

export class InvoiceService {
  static async createInvoice(data: {
    client_id: EntityId;
    order_ids: EntityId[];
    due_date: string;
    line_items?: LineItemInput[];
    subtotal: number;
    vat_percentage: number;
    vat_amount: number;
    total: number;
  }, userId: EntityId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const invoiceNumber = generateInvoiceNumber();
      const issueDate = new Date().toISOString().slice(0, 10);

      let calculatedSubtotal = 0;
      let calculatedVatAmount = 0;
      let calculatedTotal = 0;

      // 1. Process orders (Main source of revenue)
      for (const orderId of data.order_ids) {
        const order = await OrderRepository.findById(orderId);
        if (!order) throw new AppError(`La orden #${orderId} no existe.`, 404);

        const items = await OrderRepository.findItemsByOrderId(orderId);
        if (!items || items.length === 0) {
          throw new AppError(`La orden #${order.order_number} no tiene ítems confirmados y no puede ser facturada.`, 400);
        }

        if (order.is_invoiced) {
          throw new AppError(`La orden #${order.order_number} ya ha sido facturada previamente.`, 400);
        }

        calculatedSubtotal += Number(order.subtotal);
        calculatedVatAmount += Number(order.vat_amount);
        calculatedTotal += Number(order.total);
      }

      // 2. Process additional line items (Extra charges)
      const extraItems = data.line_items || [];
      for (const item of extraItems) {
        calculatedSubtotal += Number(item.total_price);
        // Assuming extra items prices are already calculated with VAT or exempt 
        // OR calculate VAT for them based on vat_percentage if desired. 
        // For now, let's just add to total to match subtotal logic.
        calculatedTotal += Number(item.total_price);
      }

      const invoiceId = await InvoiceRepository.insert(conn, {
        invoice_number: invoiceNumber,
        client_id: data.client_id,
        issue_date: issueDate,
        due_date: data.due_date,
        subtotal: calculatedSubtotal,
        vat_percentage: data.vat_percentage || 18,
        vat_amount: calculatedVatAmount,
        total: calculatedTotal,
        status: "pending",
      });

      // Insert extra line items records
      for (const item of extraItems) {
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

  static async createAutomaticInvoice(orderId: EntityId, userId: EntityId) {
    const order = await OrderRepository.findById(orderId);
    if (!order) return null;
    if (order.is_invoiced) return null;

    // Get client credit terms
    const profile = await ClientProfileRepository.findByUserId(order.client_id);
    const terms = profile?.credits_terms_days ?? 30;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + terms);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    return await this.createInvoice({
      client_id: order.client_id,
      order_ids: [orderId],
      due_date: dueDateStr,
      subtotal: Number(order.subtotal),
      vat_percentage: Number(order.vat_percentage),
      vat_amount: Number(order.vat_amount),
      total: Number(order.total),
    }, userId);
  }

  static async getAllInvoices(
    filter: { status?: string; client_id?: EntityId | undefined; from?: string; to?: string; search?: string | undefined },
    limit: number,
    offset: number
  ) {

    const [invoices, total] = await Promise.all([
      InvoiceRepository.findManyFiltered(filter, limit, offset),
      InvoiceRepository.countFiltered(filter),
    ]);
    return { invoices, total };
  }

  static async getInvoiceById(id: EntityId) {
    const invoice = await InvoiceRepository.findById(id);
    if (!invoice) return null;
    return invoice;
  }

  /**
   * (Removed getClientIdForUser as it is no longer needed with the user_id standardization)
   */

  static async recordPayment(
    invoiceId: EntityId,
    payment: {
      amount: number;
      method: "cash" | "bank_transfer" | "card";
      transaction_reference: string;
    },
    userId: EntityId
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
