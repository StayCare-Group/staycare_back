export enum OrderStatus {
  PENDING = "pending",
  ASSIGNED = "assigned",
  TRANSIT = "transit",
  ARRIVED = "arrived",
  WASHING = "washing",
  DRYING = "drying",
  IRONING = "ironing",
  QUALITY_CHECK = "quality_check",
  READY_TO_DELIVERY = "ready_to_delivery",
  COLLECTED = "collected",
  DELIVERED = "delivered",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  RESCHEDULED = "rescheduled",
}

/**
 * Statuses excluded from every report/dashboard count (orders, items, conditions...).
 * Cancelled orders never represent real laundry volume.
 */
export const REPORT_EXCLUDED_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.CANCELLED];

/**
 * Dashboard KPI item status groups.
 * Together, PENDING + PROCESSING + DELIVERED partition all non-excluded OrderStatus values.
 */
export const PENDING_ITEM_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.RESCHEDULED,
  OrderStatus.ASSIGNED,
  OrderStatus.TRANSIT,
  OrderStatus.ARRIVED,
]);

export const PROCESSING_ITEM_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.QUALITY_CHECK,
]);

export const DELIVERED_ITEM_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.READY_TO_DELIVERY,
  OrderStatus.COLLECTED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);

/**
 * Dashboard operational order count groups (Step B3):
 * - ORDERS_TO_PICKUP_STATUSES: orders waiting to be picked up from the client.
 * - ORDERS_TO_DELIVER_STATUSES: orders ready in plant or out for delivery to the client.
 */
export const ORDERS_TO_PICKUP_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.ASSIGNED,
  OrderStatus.RESCHEDULED,
]);

export const ORDERS_TO_DELIVER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.READY_TO_DELIVERY,
  OrderStatus.COLLECTED,
]);

/**
 * Statuses in which an order can be invoiced.
 * An order is only billable once it has been received in plant (receiveInPlant → ARRIVED),
 * because that is the step where staff confirm the items and the order value is finalized.
 */
export const INVOICEABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.ARRIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.QUALITY_CHECK,
  OrderStatus.READY_TO_DELIVERY,
  OrderStatus.COLLECTED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
]);
