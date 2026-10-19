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
