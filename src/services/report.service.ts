import {
  ReportRepository,
  type OrderSlaHistory,
  type RawDashboardAlertRow,
} from "../repositories/report.repository";
import { fromDbOrderStatus } from "../repositories/order.repository";
import {
  getBusinessDateRangeUtc,
  countCalendarDaysInclusive,
  formatBusinessDate,
  listBusinessCalendarDays,
  listBusinessCalendarMonths,
  getMonthCalendarRange,
} from "../utils/businessDate";
import {
  OrderStatus,
  PENDING_ITEM_ORDER_STATUSES,
  PROCESSING_ITEM_ORDER_STATUSES,
  DELIVERED_ITEM_ORDER_STATUSES,
  ORDERS_TO_PICKUP_STATUSES,
  ORDERS_TO_DELIVER_STATUSES,
  INVOICEABLE_ORDER_STATUSES,
} from "../types/orderStatus";
import { ITEM_CATEGORIES, type ItemCategory } from "../types/itemCategory";

export interface DashboardOverviewQuery {
  /** Inclusive business calendar day (YYYY-MM-DD, Malta). */
  from: string;
  /** Inclusive business calendar day (YYYY-MM-DD, Malta). */
  to: string;
  clientId?: string | undefined;
}

export interface DashboardItemsInProcess {
  washing: number;
  drying: number;
  ironing: number;
  qualityCheck: number;
}

export interface DashboardItemConditions {
  good: number;
  bad: number;
  stained: number;
  total: number;
}

export interface DashboardOverview {
  ordersReceived: number;
  itemsTotal: number;
  itemsPending: number;
  itemsProcessed: number;
  itemsDelivered: number;
  ordersToPickup: number;
  ordersToDeliver: number;
  itemsInProcess: DashboardItemsInProcess;
  itemConditions: DashboardItemConditions;
}

export type DashboardSeriesGranularity = "day" | "month";

export interface DashboardOrdersPoint {
  /** `YYYY-MM-DD` when granularity is `day`, or `YYYY-MM` when granularity is `month`. */
  date: string;
  orders: number;
}

export interface DashboardOrdersSeries {
  granularity: DashboardSeriesGranularity;
  points: DashboardOrdersPoint[];
}

const MAX_DAILY_GRANULARITY_DAYS = 31;

export const ALERT_THRESHOLD_HOURS = 24;

export interface DashboardAlertItem {
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  status: OrderStatus;
  hoursDelayed: number;
  referenceDate: string;
  specialNotes?: string | null;
}

export interface DashboardAlerts {
  thresholdHours: number;
  totalAlerts: number;
  overduePickups: DashboardAlertItem[];
  stalledOrders: DashboardAlertItem[];
}

export interface DashboardMonthlyComparisonRow {
  key: "totalItems" | "totalOrders" | "totalStained" | "totalIroned" | "totalInvoiced";
  monthA: number;
  monthB: number;
  difference: number;
  variationPercent: number | null;
}

export interface DashboardMonthlyComparison {
  monthA: string;
  monthB: string;
  rows: DashboardMonthlyComparisonRow[];
}

export interface DashboardTopGarmentItem {
  category: ItemCategory;
  quantity: number;
  percentage: number;
}

export interface DashboardGarmentProcessItem {
  category: ItemCategory;
  washing: number;
  drying: number;
  ironing: number;
}

export interface DashboardGarmentsSummary {
  totalItems: number;
  topGarments: DashboardTopGarmentItem[];
  processSummary: DashboardGarmentProcessItem[];
}

export class ReportService {
  static async getDashboardAlerts(
    { clientId }: { clientId?: string | undefined } = {},
    now: Date = new Date()
  ): Promise<DashboardAlerts> {
    const thresholdMs = ALERT_THRESHOLD_HOURS * 3600 * 1000;
    const thresholdDate = new Date(now.getTime() - thresholdMs);

    const [rawPickups, rawStalled] = await Promise.all([
      ReportRepository.getDashboardOverduePickups(thresholdDate, clientId),
      ReportRepository.getDashboardStalledOrders(thresholdDate, clientId),
    ]);

    const mapItem = (row: RawDashboardAlertRow): DashboardAlertItem => {
      const refTime = row.referenceDate.getTime();
      const hoursDelayed = Math.max(0, Math.floor((now.getTime() - refTime) / 3600000));
      return {
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        clientId: row.clientId,
        clientName: row.clientName,
        status: fromDbOrderStatus(row.status) as OrderStatus,
        hoursDelayed,
        referenceDate: row.referenceDate.toISOString(),
        specialNotes: row.specialNotes ?? null,
      };
    };

    const overduePickups = rawPickups.map(mapItem);
    const stalledOrders = rawStalled.map(mapItem);

    return {
      thresholdHours: ALERT_THRESHOLD_HOURS,
      totalAlerts: overduePickups.length + stalledOrders.length,
      overduePickups,
      stalledOrders,
    };
  }

  static async getDashboardOverview({ from, to, clientId }: DashboardOverviewQuery): Promise<DashboardOverview> {
    const { start, endExclusive } = getBusinessDateRangeUtc(from, to);
    const [
      { ordersByStatus, itemsByStatus, conditionsByStatus = {} },
      liveProcessRows,
    ] = await Promise.all([
      ReportRepository.getDashboardStatusBreakdowns({
        start,
        endExclusive,
        clientId,
      }),
      ReportRepository.getLiveProcessBreakdowns([...PROCESSING_ITEM_ORDER_STATUSES], clientId),
    ]);

    let ordersReceived = 0;
    let ordersToPickup = 0;
    let ordersToDeliver = 0;

    for (const [rawStatus, rawCount] of Object.entries(ordersByStatus)) {
      const status = rawStatus as OrderStatus;
      const count = Number(rawCount) || 0;
      ordersReceived += count;

      if (ORDERS_TO_PICKUP_STATUSES.has(status)) {
        ordersToPickup += count;
      } else if (ORDERS_TO_DELIVER_STATUSES.has(status)) {
        ordersToDeliver += count;
      }
    }

    let itemsTotal = 0;
    let itemsPending = 0;
    let itemsProcessed = 0;
    let itemsDelivered = 0;

    for (const [rawStatus, rawCount] of Object.entries(itemsByStatus)) {
      const status = rawStatus as OrderStatus;
      const count = Number(rawCount) || 0;
      itemsTotal += count;

      if (PENDING_ITEM_ORDER_STATUSES.has(status)) {
        itemsPending += count;
      } else if (PROCESSING_ITEM_ORDER_STATUSES.has(status)) {
        itemsProcessed += count;
      } else if (DELIVERED_ITEM_ORDER_STATUSES.has(status)) {
        itemsDelivered += count;
      }
    }

    // Live snapshot (ignores the date range): what is physically in process right now.
    const liveItemsByStatus: Partial<Record<OrderStatus, number>> = {};
    for (const row of liveProcessRows) {
      liveItemsByStatus[row.status] = (liveItemsByStatus[row.status] ?? 0) + row.itemCount;
    }

    const itemsInProcess: DashboardItemsInProcess = {
      washing: liveItemsByStatus[OrderStatus.WASHING] ?? 0,
      drying: liveItemsByStatus[OrderStatus.DRYING] ?? 0,
      ironing: liveItemsByStatus[OrderStatus.IRONING] ?? 0,
      qualityCheck: liveItemsByStatus[OrderStatus.QUALITY_CHECK] ?? 0,
    };

    let good = 0;
    let bad = 0;
    let stained = 0;

    for (const [rawStatus, cond] of Object.entries(conditionsByStatus)) {
      const status = rawStatus as OrderStatus;
      if (INVOICEABLE_ORDER_STATUSES.has(status) && cond) {
        good += Number(cond.good) || 0;
        bad += Number(cond.bad) || 0;
        stained += Number(cond.stained) || 0;
      }
    }

    const itemConditions: DashboardItemConditions = {
      good,
      bad,
      stained,
      total: good + bad + stained,
    };

    return {
      ordersReceived,
      itemsTotal,
      itemsPending,
      itemsProcessed,
      itemsDelivered,
      ordersToPickup,
      ordersToDeliver,
      itemsInProcess,
      itemConditions,
    };
  }

  static async getDashboardDailyOrders({
    from,
    to,
    clientId,
  }: DashboardOverviewQuery): Promise<DashboardOrdersSeries> {
    const daysCount = countCalendarDaysInclusive(from, to);
    const granularity: DashboardSeriesGranularity =
      daysCount <= MAX_DAILY_GRANULARITY_DAYS ? "day" : "month";

    const { start, endExclusive } = getBusinessDateRangeUtc(from, to);
    const hourlyRows = await ReportRepository.getDashboardOrdersByHour({
      start,
      endExclusive,
      clientId,
    });

    const bucketKeys =
      granularity === "day"
        ? listBusinessCalendarDays(from, to)
        : listBusinessCalendarMonths(from, to);

    const bucketMap = new Map<string, number>();
    for (const key of bucketKeys) {
      bucketMap.set(key, 0);
    }

    for (const row of hourlyRows) {
      const maltaDate = formatBusinessDate(row.hourUtc);
      const bucketKey = granularity === "day" ? maltaDate : maltaDate.slice(0, 7);
      if (bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + (Number(row.orderCount) || 0));
      }
    }

    return {
      granularity,
      points: Array.from(bucketMap.entries(), ([date, orders]) => ({ date, orders })),
    };
  }

  private static async getMonthMetrics(
    from: string,
    to: string,
    clientId?: string | undefined
  ): Promise<{
    totalOrders: number;
    totalItems: number;
    totalStained: number;
    totalIroned: number;
    totalInvoiced: number;
  }> {
    const { start, endExclusive } = getBusinessDateRangeUtc(from, to);
    const [breakdown, totalInvoiced] = await Promise.all([
      ReportRepository.getDashboardStatusBreakdowns({ start, endExclusive, clientId }),
      ReportRepository.getDashboardInvoicedTotal(from, to, clientId),
    ]);

    let totalOrders = 0;
    for (const count of Object.values(breakdown.ordersByStatus)) {
      totalOrders += Number(count) || 0;
    }

    let totalItems = 0;
    for (const count of Object.values(breakdown.itemsByStatus)) {
      totalItems += Number(count) || 0;
    }

    let totalStained = 0;
    for (const [rawStatus, cond] of Object.entries(breakdown.conditionsByStatus ?? {})) {
      if (INVOICEABLE_ORDER_STATUSES.has(rawStatus as OrderStatus) && cond) {
        totalStained += Number(cond.stained) || 0;
      }
    }

    let totalIroned = 0;
    for (const count of Object.values(breakdown.ironedItemsByStatus ?? {})) {
      totalIroned += Number(count) || 0;
    }

    return { totalOrders, totalItems, totalStained, totalIroned, totalInvoiced };
  }

  static async getDashboardComparison({
    monthA,
    monthB,
    clientId,
  }: {
    monthA: string;
    monthB: string;
    clientId?: string | undefined;
  }): Promise<DashboardMonthlyComparison> {
    const rangeA = getMonthCalendarRange(monthA);
    const rangeB = getMonthCalendarRange(monthB);

    const [metricsA, metricsB] = await Promise.all([
      ReportService.getMonthMetrics(rangeA.from, rangeA.to, clientId),
      ReportService.getMonthMetrics(rangeB.from, rangeB.to, clientId),
    ]);

    const buildRow = (
      key: DashboardMonthlyComparisonRow["key"],
      valA: number,
      valB: number,
      isCurrency: boolean = false
    ): DashboardMonthlyComparisonRow => {
      const roundedA = isCurrency ? Math.round(valA * 100) / 100 : Math.round(valA);
      const roundedB = isCurrency ? Math.round(valB * 100) / 100 : Math.round(valB);
      const difference = isCurrency
        ? Math.round((roundedB - roundedA) * 100) / 100
        : roundedB - roundedA;

      let variationPercent: number | null = null;
      if (roundedA > 0) {
        variationPercent = Math.round(((roundedB - roundedA) / roundedA) * 1000) / 10;
      } else if (roundedA < 0) {
        variationPercent = Math.round(((roundedB - roundedA) / Math.abs(roundedA)) * 1000) / 10;
      }

      return {
        key,
        monthA: roundedA,
        monthB: roundedB,
        difference,
        variationPercent,
      };
    };

    return {
      monthA,
      monthB,
      rows: [
        buildRow("totalItems", metricsA.totalItems, metricsB.totalItems),
        buildRow("totalOrders", metricsA.totalOrders, metricsB.totalOrders),
        buildRow("totalStained", metricsA.totalStained, metricsB.totalStained),
        buildRow("totalIroned", metricsA.totalIroned, metricsB.totalIroned),
        buildRow("totalInvoiced", metricsA.totalInvoiced, metricsB.totalInvoiced, true),
      ],
    };
  }

  static async getDashboardGarments({
    from,
    to,
    clientId,
  }: DashboardOverviewQuery): Promise<DashboardGarmentsSummary> {
    const { start, endExclusive } = getBusinessDateRangeUtc(from, to);
    const [rows, liveProcessRows] = await Promise.all([
      ReportRepository.getDashboardGarmentBreakdowns({
        start,
        endExclusive,
        clientId,
      }),
      ReportRepository.getLiveProcessBreakdowns(
        [OrderStatus.WASHING, OrderStatus.DRYING, OrderStatus.IRONING],
        clientId
      ),
    ]);

    const totalsByCat: Record<ItemCategory, number> = {
      sheets: 0,
      covers: 0,
      towels: 0,
      pillow_cases: 0,
      others: 0,
    };

    const processByCat: Record<ItemCategory, { washing: number; drying: number; ironing: number }> = {
      sheets: { washing: 0, drying: 0, ironing: 0 },
      covers: { washing: 0, drying: 0, ironing: 0 },
      towels: { washing: 0, drying: 0, ironing: 0 },
      pillow_cases: { washing: 0, drying: 0, ironing: 0 },
      others: { washing: 0, drying: 0, ironing: 0 },
    };

    let totalItems = 0;

    // Top garments: volume within the selected date range.
    for (const row of rows) {
      const qty = Number(row.itemCount) || 0;
      totalsByCat[row.category] = (totalsByCat[row.category] ?? 0) + qty;
      totalItems += qty;
    }

    // Process summary: live snapshot, independent of the date range.
    for (const row of liveProcessRows) {
      const qty = Number(row.itemCount) || 0;
      if (row.status === OrderStatus.WASHING) {
        processByCat[row.category].washing += qty;
      } else if (row.status === OrderStatus.DRYING) {
        processByCat[row.category].drying += qty;
      } else if (row.status === OrderStatus.IRONING) {
        processByCat[row.category].ironing += qty;
      }
    }

    const topGarments: DashboardTopGarmentItem[] = ITEM_CATEGORIES.map((category) => {
      const quantity = totalsByCat[category] ?? 0;
      const percentage =
        totalItems > 0 ? Math.round((quantity / totalItems) * 1000) / 10 : 0;
      return { category, quantity, percentage };
    }).sort((a, b) => b.quantity - a.quantity);

    const processSummary: DashboardGarmentProcessItem[] = ITEM_CATEGORIES.map((category) => ({
      category,
      washing: processByCat[category].washing,
      drying: processByCat[category].drying,
      ironing: processByCat[category].ironing,
    }));

    return {
      totalItems,
      topGarments,
      processSummary,
    };
  }

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
