import { Request, Response } from "express";
import { InvoiceService } from "../services/invoice.service";
import { InvoiceRepository } from "../repositories/invoice.repository";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";


/**
 * @swagger
 * /api/invoices:
 *   post:
 *     summary: Crear una nueva factura
 *     tags: [Invoices]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client, orders, due_date, line_items, subtotal, vat_amount, total]
 *             properties:
 *               client:
 *                 type: integer
 *               orders:
 *                 type: array
 *                 items:
 *                   type: integer
 *               due_date:
 *                 type: string
 *                 format: date
 *               line_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     description: { type: string }
 *                     quantity: { type: integer }
 *                     unit_price: { type: number }
 *                     total_price: { type: number }
 *               subtotal: { type: number }
 *               vat_percentage: { type: number, default: 18 }
 *               vat_amount: { type: number }
 *               total: { type: number }
 *     responses:
 *       201:
 *         description: Factura creada exitosamente
 *       400:
 *         description: Error en la creación de la factura
 */
export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { client, orders, due_date, line_items, subtotal, vat_percentage, vat_amount, total } = req.body;

    const invoice = await InvoiceService.createInvoice({
      client_id: String(client),
      order_ids: (orders as any[]).map(String),
      due_date: due_date.slice(0, 10), // Extract YYYY-MM-DD
      line_items,
      subtotal,
      vat_percentage,
      vat_amount,
      total,
    }, req.user!.userId);

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
      client_id?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      search?: string | undefined;
    } = {
      status: status as string,
      client_id: client_id as string,
      from: from as string,
      to: to as string,
      search: search as string,
    };

    // If client role, force client_id to the authenticated user's ID
    if (req.user!.role === "client") {
      filter.client_id = req.user!.userId;
    }

    const { invoices, total } = await InvoiceService.getAllInvoices(filter as any, limit, skip);

    // Transform to match the POST structure
    const formattedInvoices = invoices.map((inv: any) => {
      const { client_id, ...rest } = inv;
      return {
        ...rest,
        // client already renamed to 'client' in repository SQL
        orders: inv.orders || [],
      };
    });

    return sendSuccess(
      res,
      200,
      "Invoices retrieved",
      formattedInvoices,
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    console.error("getAllInvoices error:", error);
    return sendError(res, 400, "Failed to fetch invoices");
  }
};

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     summary: Obtener detalle de una factura
 *     tags: [Invoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle de la factura
 *       403:
 *         description: Prohibido (solo dueño o admin)
 *       404:
 *         description: Factura no encontrada
 */
export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await InvoiceService.getInvoiceById(invoiceId as string);
    if (!invoice) return sendError(res, 404, "Invoice not found");

    // Return full objects for orders
    const { client_id, ...formattedInvoice } = invoice as any;

    // Authorization check for client role
    if (req.user!.role === "client") {
      const authUserId = req.user!.userId;
      if (invoice.client_id !== authUserId) {
        return sendError(res, 403, "Forbidden");
      }
    }

    return sendSuccess(res, 200, "Invoice retrieved", formattedInvoice);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Failed to fetch invoice");
  }
};

/**
 * @swagger
 * /api/invoices/{id}/payments:
 *   post:
 *     summary: Registrar un pago para una factura
 *     tags: [Invoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method, transaction_reference]
 *             properties:
 *               amount: { type: number }
 *               method: { type: string, enum: [cash, bank_transfer, card] }
 *               transaction_reference: { type: string }
 *     responses:
 *       200:
 *         description: Pago registrado exitosamente
 *       400:
 *         description: Error al registrar el pago
 *       404:
 *         description: Factura no encontrada
 */
export const recordPayment = async (req: Request, res: Response) => {
  try {
    const invoiceId = req.params.id;

    const { amount, method, transaction_reference } = req.body;

    const invoice = await InvoiceService.recordPayment(invoiceId as string, {
      amount: Number(amount),
      method,
      transaction_reference,
    }, req.user!.userId);

    return sendSuccess(res, 200, "Payment recorded", invoice);
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Payment recording failed");
  }
};

/**
 * @swagger
 * /api/invoices/mark-overdue:
 *   post:
 *     summary: Marcar facturas vencidas (Admin)
 *     tags: [Invoices]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Facturas actualizadas
 *       400:
 *         description: Error al actualizar
 */
export const markOverdue = async (_req: Request, res: Response) => {
  try {
    const affectedRows = await InvoiceService.markOverdue();
    return sendSuccess(res, 200, "Overdue invoices updated", { affectedRows });
  } catch (error: any) {
    return sendError(res, 400, error.message || "Failed to update overdue invoices");
  }
};

/**
 * GET /api/invoices/export
 *
 * Downloads all invoices matching the active filters as a single CSV file.
 * Each row represents one invoice with its financial summary (1 row per invoice).
 * Replaces the previous pattern of N individual GET /api/invoices/:id calls.
 *
 * Access: admin, staff only.
 */
export const exportInvoices = async (req: Request, res: Response) => {
  try {
    const { status, client_id, from, to, search } = req.query;

    const filter: { status?: string; client_id?: string; from?: string; to?: string; search?: string } = {};
    if (status)    filter.status    = status    as string;
    if (client_id) filter.client_id = client_id as string;
    if (from)      filter.from      = from      as string;
    if (to)        filter.to        = to        as string;
    if (search)    filter.search    = search    as string;

    const rows = await InvoiceRepository.findManyForExport(filter);

    if (rows.length === 0) {
      return sendError(res, 404, "No invoices found for the selected filters");
    }

    // ─── Build CSV ────────────────────────────────────────────────────────────
    const escape = (value: unknown): string => {
      const str = value === null || value === undefined ? "" : String(value);
      // Wrap in quotes if the value contains commas, semicolons, quotes or newlines
      if (str.includes(",") || str.includes(";") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const formatDate = (val: unknown): string => {
      if (!val) return "";
      if (val instanceof Date) {
        if (isNaN(val.getTime())) return "";
        return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
      }
      const str = String(val).trim();
      const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match?.[1]) return match[1];
      const d = new Date(str);
      if (isNaN(d.getTime())) return "";
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const headers = [
      "Invoice #",
      "Order(s)",
      "Client",
      "Contact Person",
      "Issue Date",
      "Due Date",
      "Status",
      "Subtotal",
      "VAT %",
      "VAT Amount",
      "Grand Total",
      "Items",
    ];

    const csvLines: string[] = [headers.map(escape).join(",")];

    for (const inv of rows) {
      let lineItems: { description?: string; quantity?: number; unit_price?: number; total_price?: number }[] = [];
      try {
        const raw = typeof inv.line_items_json === "string" ? JSON.parse(inv.line_items_json) : inv.line_items_json;
        lineItems = Array.isArray(raw) ? raw.filter(Boolean) : [];
      } catch {
        lineItems = [];
      }

      const itemsSummary = lineItems
        .map((it) => {
          const qty = it.quantity ?? 1;
          const desc = it.description ?? "Item";
          const price = it.total_price != null ? ` (€${Number(it.total_price).toFixed(2)})` : "";
          return `${qty}x ${desc}${price}`;
        })
        .join("; ");

      const row = [
        inv.invoice_number ?? "",
        inv.order_numbers  ?? "",
        inv.client_name    ?? "",
        inv.contact_person ?? "",
        formatDate(inv.issue_date),
        formatDate(inv.due_date),
        inv.status         ?? "",
        inv.subtotal       ?? 0,
        inv.vat_percentage ?? 0,
        inv.vat_amount     ?? 0,
        inv.total          ?? 0,
        itemsSummary,
      ];
      csvLines.push(row.map(escape).join(","));
    }

    const csv = csvLines.join("\n");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Facturas-StayCare-${dateStr}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // BOM so Excel opens UTF-8 CSV correctly
    return res.status(200).send("\uFEFF" + csv);
  } catch (error: any) {
    console.error("exportInvoices error:", error);
    return sendError(res, 500, error.message || "Failed to export invoices");
  }
};

