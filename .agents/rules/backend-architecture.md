---
trigger: always_on
---

# Backend Architecture Rules

Full description with diagrams of the request flow: `docs/ARCHITECTURE.md`.
Code templates: skill `staycare-backend` (`.agents/skills/staycare-backend/`).

## Layers (flat folders under `src/`, NOT `modules/`)

| Layer | Folder | Responsibility | Must NOT |
| :-- | :-- | :-- | :-- |
| Routes | `routes/*.routes.ts` | HTTP verb + middleware chain | contain logic |
| Controller | `controllers/*.controller.ts` | parse request, call service, shape response, Swagger docs | contain SQL or business rules |
| Service | `services/*.service.ts` | business rules, permissions by status/role, transactions | contain SQL or `req`/`res` |
| Repository | `repositories/*.repository.ts` | raw SQL only (mysql2) | contain business decisions |
| Validation | `validation/*.validation.ts` | Zod schemas (`{ body, params, query }`) | — |
| Types / utils | `types/`, `utils/` | enums, `AppError`, `jwt`, `paginate`, `response`, `mail`, `id` | — |
| DB | `db/pool.ts`, `db/transaction.ts` | shared pool and `withTransaction` | — |

Middleware order per route: `authenticate` → `authorize(...roles)` or
`authorizePermission(perm)` → `validate(schema)` → controller.
`router.use(authenticate)` is the default for protected routers.

## Conventions

- Files: `<entity>.<layer>.ts` (e.g. `order.service.ts`). Repositories and
  services are classes with `static async` methods (`OrderRepository`,
  `OrderService`). Match the surrounding style.
- Entity IDs are UUID strings (`EntityId`, `generateEntityId()`), `CHAR(36)`.
- DB tables/columns `snake_case`; API paths `kebab-case` plural; code `camelCase`.
- Dates stored/handled in UTC (`timezone: 'Z'`).
- Register new routers in `src/app.ts`; add Swagger JSDoc to controllers.
- Routes with fixed segments (`/export`, `/bulk/deliver`) must be declared
  **before** `/:id`.

## Responses and errors

- Success: `sendSuccess(res, status, message, data?, pagination?)` →
  `{ success, message, data?, pagination? }`.
- Error: `{ success: false, message }`. Throw `AppError(message, statusCode)`
  from services; `errorHandler` formats it. Use `sendError` only for errors
  the controller itself handles.
- Status codes: 200/201 ok, 400 validation, 401 unauthenticated,
  403 forbidden, 404 not found, 409 conflict/invalid state, 500 internal.
- Some legacy code throws `Object.assign(new Error(..), { status })` or matches
  on `error.message`. Do not copy it into new code; prefer `AppError`.

## Pagination

Use `parsePagination(req, defaultLimit)` and `paginationMeta(total, page, limit)`
from `utils/paginate.ts` (max `limit` is 200). Response shape:
`pagination: { page, limit, total, pages, hasNextPage, hasPrevPage }`.
The frontend `apiFetch` unwraps `data` and attaches `pagination` as
`data._pagination`, so the `data` of a paginated endpoint must be an **array**
(or the frontend will not receive the metadata). Do not change this shape
without updating the frontend.

## CSV exports

`POST /api/orders/export` and `/export/stained` (admin/staff) accept either
selected `ids` or the active list filters, so exports cover **all** matching
orders and not only the visible page. Keep both behaviours when changing them.
