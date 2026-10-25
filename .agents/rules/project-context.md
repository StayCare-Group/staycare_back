---
trigger: always_on
---

# StayCare Backend — Project Context

StayCare is an existing, production-oriented, bilingual (en/es) B2B laundry
management application. This repository is the **REST API**. The frontend lives
in a separate repository (`StayCare-Frontend`, app inside `StayCare/`).

Do not recreate the project, replace its architecture or change its stack.
Full business context: `docs/PROJECT_CONTEXT.md`. Architecture detail:
`docs/ARCHITECTURE.md`.

## Stack (verified against `package.json`)

- Node.js 20 LTS, Express 5, TypeScript 5 (`strict`)
- MySQL 8 via `mysql2/promise` — raw SQL, **no ORM**
- Auth: JWT in httpOnly cookies (`accessToken`, `refreshToken`)
- Validation: Zod 4. Docs: Swagger (`/api-docs`). Tests: Vitest
- Local: Docker Compose (MySQL + backend) — **Docker is local only**
- Production: Render (API) + external managed MySQL (SSL required)

## Roles

`admin`, `staff`, `operator`, `driver`, `client`.

- Clients can have **sub-users** with custom roles and granular permissions
  (`orders:create|read|update|delete`). Their JWT carries `parentClientId` and
  `permissions`.
- `authorize(...roles)` checks roles (sub-users pass as `client`).
- `authorizePermission(perm)` lets `admin`/`staff` and the main client account
  through, and checks `permissions` for everyone else.
- Per-status role rules for order transitions are validated **inside the
  service** (`OrderService.advanceStatus`), not only in routes.

## Order statuses (source of truth: `src/types/orderStatus.ts`)

API/enum values are **snake_case**:
`pending, assigned, transit, arrived, washing, drying, ironing, quality_check,
ready_to_delivery, collected, delivered, completed, cancelled, rescheduled`.

> The MySQL `orders.status` column stores **PascalCase** (`QualityCheck`,
> `ReadyToDeliver`, …). Conversion happens only in `order.repository.ts`
> (`toDbOrderStatus` / `fromDbOrderStatus`). Never write raw PascalCase
> strings elsewhere and never change the DB enum without a migration.

Invoicing is **not** a status: it uses the `is_invoiced` flag and
`INVOICEABLE_ORDER_STATUSES` (`arrived` onward, after plant reception).

## Order flows

- **Route-based pickup**: pending → assigned (route + driver) → transit →
  driver confirms pickup → plant reception (`arrived`).
- **Manual pickup / manual delivery**: no driver, route or route stop.
  Never assume they exist. Confirm exact transitions in the service.
- **Processing**: arrived → washing → drying → ironing → quality_check →
  ready_to_delivery (rollback options exist).
- **Delivery**: ready_to_delivery/collected → delivered → completed.
- `cancelled` / `rescheduled` are side states.

When docs and code disagree, **the code and DB schema win**; report the
conflict instead of silently changing behavior.

## Sources of truth (in order)

1. Backend business logic and authorization
2. DB schema (`docs/migration/staycare_mysql.sql`) and stored values
3. Enums, constants, types
4. API contracts (Swagger annotations, Zod schemas)
5. Frontend implementation
6. Project documentation
