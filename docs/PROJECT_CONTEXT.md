# StayCare Backend — Project Context

## Objective

StayCare is an existing bilingual (English/Spanish) B2B laundry management
application. It controls the complete lifecycle of laundry orders: creation,
pickup, plant reception, processing, completion, delivery and invoicing.

This repository is the REST API. The web client is the separate
`StayCare-Frontend` repository (Vue 3, app under `StayCare/`).

## Technology

- Node.js 20, Express 5, TypeScript 5
- MySQL 8 (`mysql2/promise`, raw SQL, UUID `CHAR(36)` primary keys)
- JWT in httpOnly cookies, Zod validation, Swagger docs
- Vitest for tests; Docker Compose for the local environment only
- Production: Render (API) + external managed MySQL with SSL

## User roles

| Role | Description |
| :-- | :-- |
| `admin` | Full access |
| `staff` | Plant operation, clients, orders, invoices |
| `operator` | Internal plant operator |
| `driver` | Assigned routes, pickup/delivery actions |
| `client` | Own orders, invoices, properties, price list |

### Client sub-users and custom roles

Clients create custom roles (e.g. "Order Manager") with granular permissions
(`orders:create`, `orders:read`, `orders:update`, `orders:delete`) and assign them
to sub-users. Sub-user JWTs include `parentClientId` and `permissions`.
Tables: `roles` (`client_id`, `is_system`), `permissions`, `role_permissions`,
`users.parent_client_id`. Endpoints under `/api/clients/:id/roles` and
`/api/clients/:id/users`; ownership via `ensureClientAccess()`.

## Order statuses

API values (`src/types/orderStatus.ts`, snake_case):
`pending, assigned, transit, arrived, washing, drying, ironing, quality_check,
ready_to_delivery, collected, delivered, completed, cancelled, rescheduled`.

The DB stores PascalCase; `order.repository.ts` converts both ways.
Invoicing uses the `is_invoiced` flag and `INVOICEABLE_ORDER_STATUSES`.

## Order flows

1. **Route-based pickup**: preparation → route + driver assignment → driver
   pickup confirmation → reception by staff (`arrived`).
2. **Manual pickup**: no driver, route or route stop. Exact transitions must be
   confirmed in `order.service.ts` — do not assume they match route-based.
3. **Processing**: washing → drying → ironing → quality check → ready to deliver.
4. **Route-based delivery**: preparation → route + driver → driver delivery →
   final confirmation.
5. **Manual delivery**: no driver, route or route stop.
6. **Bulk driver confirmation**: `PATCH /api/orders/bulk/deliver`.

## Recent functional areas

- Paginated lists (orders, invoices, client detail orders, machines, invitations).
- CSV export of orders (flat and "stained"): selected ids or all filtered rows.
- Performance indexes on `orders.created_at` and `invoices` (issue date/status).
- DB pool tuning and `conn`-reuse inside services (see
  `.agents/rules/database-and-migrations.md`).
- Per-client custom price lists (`client_custom_prices`) and pricing service.
- Order cancellation and rescheduling.

## Sources of truth

Backend logic and authorization → DB schema/stored values → enums/types →
API contracts → frontend implementation → this documentation.
If documentation conflicts with code, report the conflict; do not silently
change the system.
