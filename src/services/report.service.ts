import { ReportRepository, type OrderSlaHistory } from "../repositories/report.repository";

export class ReportService {
  static async getDashboardStats() {
    return await ReportRepository.getDashboardStats();
  }

  static async getRevenueByMonth(months: number = 12) {
    return await ReportRepository.getRevenueByMonth(months);
  }

  static async getOrdersByClient(limit: number = 20) {
    return await ReportRepository.getTopClients(limit);
  }

  static async getSlaMetrics() {
    const data = await ReportRepository.getSlaData();
    const grouped = new Map<string, { service_type: string; created_at: Date; history: { status: string; changed_at: Date }[] }>();

    for (const row of data) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          service_type: row.service_type,
          created_at: row.created_at,
          history: [],
        });
      }
      grouped.get(row.id)!.history.push({ status: row.status, changed_at: row.changed_at });
    }

    let onTime = 0;
    let late = 0;
    let critical = 0;
    const processingHours: number[] = [];
    const deliveryHours: number[] = [];
    const MS_PER_HOUR = 3600000;

    for (const [id, order] of grouped) {
      const history = order.history;
      
      const findTs = (statuses: string[]) => {
        const lowerStatuses = statuses.map((s) => s.toLowerCase());
        const entry = history.find((h) => lowerStatuses.includes(h.status.toLowerCase()));
        return entry?.changed_at ? entry.changed_at.getTime() : null;
      };

      const arrivedAt = findTs(["Arrived"]);
      const readyAt = findTs(["ReadyToDelivery", "Completed", "Delivered"]);
      if (arrivedAt && readyAt && readyAt > arrivedAt) {
        processingHours.push((readyAt - arrivedAt) / MS_PER_HOUR);
      }

      const deliveryStart = findTs(["ReadyToDelivery", "Collected"]);
      const deliveredAt = findTs(["Delivered", "Completed"]);
      if (deliveryStart && deliveredAt && deliveredAt > deliveryStart) {
        deliveryHours.push((deliveredAt - deliveryStart) / MS_PER_HOUR);
      }

      if (deliveredAt && order.created_at) {
        const createdAt = order.created_at.getTime();
        const totalH = (deliveredAt - createdAt) / MS_PER_HOUR;
        const target = order.service_type === "express" ? 24 : 48;
        if (totalH <= target) onTime++;
        else if (totalH <= target * 2) late++;
        else critical++;
      }
    }

    const total = onTime + late + critical;
    const avg = (arr: number[]) =>
      arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

    return {
      onTimePercent: total ? Math.round((onTime / total) * 100) : 0,
      latePercent: total ? Math.round((late / total) * 100) : 0,
      criticalPercent: total ? Math.round((critical / total) * 100) : 0,
      avgProcessingHours: avg(processingHours),
      avgDeliveryHours: avg(deliveryHours),
      totalDelivered: total,
    };
  }
}
