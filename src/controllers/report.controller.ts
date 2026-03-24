import { Request, Response } from "express";
import Order from "../models/Orders";
import Invoice from "../models/Invoices";
import Client from "../models/Clients";
import User from "../models/User";
import { sendSuccess, sendError } from "../utils/response";

export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      todayOrders,
      activeOrders,
      totalClients,
      totalDrivers,
      monthlyRevenue,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ created_at: { $gte: todayStart, $lt: todayEnd } }),
      Order.countDocuments({ status: { $nin: ["Delivered", "Completed", "Invoiced"] } }),
      Client.countDocuments(),
      User.countDocuments({ role: "driver", is_active: true }),
      Invoice.aggregate([
        { $match: { status: "paid", issue_date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$total" }, vat: { $sum: "$vat_amount" } } },
      ]),
    ]);

    const revenue = monthlyRevenue[0] ?? { total: 0, vat: 0 };

    return sendSuccess(res, 200, "Dashboard stats", {
      totalOrders,
      todayOrders,
      activeOrders,
      totalClients,
      totalDrivers,
      monthlyRevenue: revenue.total,
      monthlyVat: revenue.vat,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch dashboard stats");
  }
};

export const getRevenueByMonth = async (req: Request, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 12;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const pipeline = await Invoice.aggregate([
      { $match: { status: "paid", issue_date: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: "$issue_date" },
            month: { $month: "$issue_date" },
          },
          revenue: { $sum: "$total" },
          vat: { $sum: "$vat_amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const data = pipeline.map((p) => ({
      year: p._id.year,
      month: p._id.month,
      revenue: p.revenue,
      vat: p.vat,
      invoiceCount: p.count,
    }));

    return sendSuccess(res, 200, "Revenue by month", data);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch revenue data");
  }
};

export const getOrdersByClient = async (_req: Request, res: Response) => {
  try {
    const pipeline = await Order.aggregate([
      {
        $group: {
          _id: "$client",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$pricing_snapshot.total" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "clientInfo",
        },
      },
      { $unwind: { path: "$clientInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          clientId: "$_id",
          clientName: { $ifNull: ["$clientInfo.company_name", "Unknown"] },
          totalOrders: 1,
          totalRevenue: 1,
        },
      },
    ]);

    return sendSuccess(res, 200, "Orders by client", pipeline);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch orders by client");
  }
};

export const getSlaMetrics = async (_req: Request, res: Response) => {
  try {
    const deliveredOrders = await Order.find({
      status: { $in: ["Delivered", "Completed", "Invoiced"] },
      "status_history.0": { $exists: true },
    }).select("service_type status_history created_at").lean();

    let onTime = 0;
    let late = 0;
    let critical = 0;
    const processingHours: number[] = [];
    const deliveryHours: number[] = [];
    const MS_PER_HOUR = 3600000;

    for (const o of deliveredOrders) {
      const history = o.status_history ?? [];
      const findTs = (statuses: string[]) => {
        const entry = history.find((h: any) => statuses.includes(h.status));
        return entry?.timestamp ? new Date(entry.timestamp).getTime() : null;
      };

      const arrivedAt = findTs(["Arrived"]);
      const readyAt = findTs(["ReadyToDeliver", "Completed", "Delivered"]);
      if (arrivedAt && readyAt && readyAt > arrivedAt) {
        processingHours.push((readyAt - arrivedAt) / MS_PER_HOUR);
      }

      const deliveryStart = findTs(["ReadyToDeliver", "Collected"]);
      const deliveredAt = findTs(["Delivered", "Completed"]);
      if (deliveryStart && deliveredAt && deliveredAt > deliveryStart) {
        deliveryHours.push((deliveredAt - deliveryStart) / MS_PER_HOUR);
      }

      if (deliveredAt && o.created_at) {
        const createdAt = new Date(o.created_at).getTime();
        const totalH = (deliveredAt - createdAt) / MS_PER_HOUR;
        const target = o.service_type === "express" ? 24 : 48;
        if (totalH <= target) onTime++;
        else if (totalH <= target * 2) late++;
        else critical++;
      }
    }

    const total = onTime + late + critical;
    const avg = (arr: number[]) =>
      arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    return sendSuccess(res, 200, "SLA metrics", {
      onTimePercent: total ? Math.round((onTime / total) * 100) : 0,
      latePercent: total ? Math.round((late / total) * 100) : 0,
      criticalPercent: total ? Math.round((critical / total) * 100) : 0,
      avgProcessingHours: avg(processingHours),
      avgDeliveryHours: avg(deliveryHours),
      totalDelivered: total,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch SLA metrics");
  }
};
