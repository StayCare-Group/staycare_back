import { Request, Response } from "express";
import { InvoiceService } from "../services/invoice.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { client_id, order_ids, due_date, line_items, subtotal, vat_percentage, vat_amount, total } = req.body;

    const invoice = await InvoiceService.createInvoice({
      client_id: Number(client_id),
      order_ids: (order_ids as any[]).map(Number),
      due_date,
      line_items,
      subtotal,
      vat_percentage,
      vat_amount,
      total,
    });

    return sendSuccess(res, 201, "Invoice created", invoice);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Invoice creation failed");
  }
};

/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: Listar todas las facturas
 *     tags: [Invoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por número de factura o nombre de cliente
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, paid, overdue] }
 *       - in: query
 *         name: client_id
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de facturas con paginación
 */
export const getAllInvoices = async (req: Request, res: Response) => {
  try {
    const { status, client_id, from, to, search } = req.query;
    const { page, limit, skip } = parsePagination(req);

    const filter: {
      status?: string | undefined;
      client_id?: number | string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      search?: string | undefined;
    } = {
      status: status as string,
      client_id: client_id as string | number,
      from: from as string,
      to: to as string,
      search: search as string,
    };

    // If client role, force client_id
    if (req.user!.role === "client") {
      const dbClientId = await InvoiceService.getClientIdForUser(Number(req.user!.userId));
      if (!dbClientId) return sendError(res, 403, "Client profile not found");
      filter.client_id = dbClientId;
    }

    const { invoices, total } = await InvoiceService.getAllInvoices(filter as any, limit, skip);


    return sendSuccess(
      res,
      200,
      "Invoices retrieved",
      invoices,
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    console.error("getAllInvoices error:", error);
    return sendError(res, 400, "Failed to fetch invoices");
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);
    if (isNaN(invoiceId)) return sendError(res, 400, "Invalid invoice ID");

    const invoice = await InvoiceService.getInvoiceById(invoiceId);
    if (!invoice) return sendError(res, 404, "Invoice not found");

    // Authorization check for client role
    if (req.user!.role === "client") {
      const clientId = await InvoiceService.getClientIdForUser(Number(req.user!.userId));
      if (!clientId || invoice.client_id !== clientId) {
        return sendError(res, 403, "Forbidden");
      }
    }

    return sendSuccess(res, 200, "Invoice retrieved", invoice);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Failed to fetch invoice");
  }
};

export const recordPayment = async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);
    if (isNaN(invoiceId)) return sendError(res, 400, "Invalid invoice ID");

    const { amount, method, transaction_reference } = req.body;

    const invoice = await InvoiceService.recordPayment(invoiceId, {
      amount: Number(amount),
      method,
      transaction_reference,
    });

    return sendSuccess(res, 200, "Payment recorded", invoice);
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Payment recording failed");
  }
};

export const markOverdue = async (_req: Request, res: Response) => {
  try {
    const affectedRows = await InvoiceService.markOverdue();
    return sendSuccess(res, 200, "Overdue invoices updated", { affectedRows });
  } catch (error: any) {
    return sendError(res, 400, error.message || "Failed to update overdue invoices");
  }
};
