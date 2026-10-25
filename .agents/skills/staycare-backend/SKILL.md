---
name: staycare-backend
description: Code templates and checklist for the StayCare backend (Express 5 + TypeScript + raw MySQL). Use when creating or editing routes, controllers, services, repositories, Zod schemas, middleware, transactions or SQL.
---

# StayCare Backend Skill

Read `.agents/rules/backend-architecture.md` and
`.agents/rules/database-and-migrations.md` first; this skill adds templates.

## Golden rules

- Controller: parse request → call service → `sendSuccess`. No SQL, no rules.
- Service: business rules, permissions, transactions. No SQL, no `req`/`res`.
- Repository: SQL only, `?` placeholders, optional `conn` param.
- Schema: Zod object `{ body?, params?, query? }`, one per operation.
- Routes: `authenticate` → `authorize`/`authorizePermission` → `validate` → controller.

## Repository template (class with static methods, optional `conn`)

```typescript
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "../db/pool";
import { generateEntityId, type EntityId } from "../utils/id";

export interface IThingRow extends RowDataPacket {
  id: EntityId;
  name: string;
}

export class ThingRepository {
  static async findById(id: EntityId, conn?: PoolConnection): Promise<IThingRow | null> {
    const db = conn ?? pool;
    const [rows] = await db.query<IThingRow[]>("SELECT * FROM things WHERE id = ? LIMIT 1", [id]);
    return rows[0] ?? null;
  }

  static async insert(conn: PoolConnection, data: { name: string }): Promise<EntityId> {
    const id = generateEntityId();
    await conn.query<ResultSetHeader>("INSERT INTO things (id, name) VALUES (?, ?)", [id, data.name]);
    return id;
  }
}
```

## Service template (rules + transaction)

```typescript
import { withTransaction } from "../db/transaction";
import { AppError } from "../utils/AppError";
import { ThingRepository } from "../repositories/thing.repository";

export class ThingService {
  static async createThing(data: { name: string }) {
    return withTransaction(async (conn) => {
      const id = await ThingRepository.insert(conn, data);
      const thing = await ThingRepository.findById(id, conn);
      if (!thing) throw new AppError("Thing not found", 404);
      return thing;
    });
  }
}
```

## Controller template

```typescript
export const createThing = async (req: Request, res: Response) => {
  const thing = await ThingService.createThing(req.body);
  return sendSuccess(res, 201, "Thing created", thing);
};
```

Express 5 forwards rejected async handlers to `errorHandler`; add a
`try/catch` only when the controller must translate a specific error.
Add Swagger JSDoc (`@swagger`) above every handler.

## Schema + route template

```typescript
export const createThingSchema = z.object({
  body: z.object({ name: z.string().min(1) }),
});

router.post("/", authorizePermission("things:create"), validate(createThingSchema), createThing);
```

## Paginated list

```typescript
const { page, limit, skip } = parsePagination(req);
const { items, total } = await ThingService.list(limit, skip, filters);
return sendSuccess(res, 200, "Things retrieved", items, paginationMeta(total, page, limit));
```

`data` must be an array so the frontend receives `_pagination`.

## Naming

| Element | Convention | Example |
| :-- | :-- | :-- |
| Files | `<entity>.<layer>.ts` | `order.service.ts` |
| Classes | PascalCase | `OrderService`, `AppError` |
| DB row interfaces | PascalCase with `I` prefix | `IOrderMySQL`, `IThingRow` |
| Variables / functions | camelCase | `orderId`, `confirmPickup` |
| Constants | UPPER_SNAKE_CASE | `INVOICEABLE_ORDER_STATUSES` |
| API paths | kebab-case, plural | `/api/orders`, `/api/order-items` |
| DB tables / columns | snake_case | `order_items`, `created_at` |
| Repository methods | verb + entity | `findById`, `insert`, `updateStatus` |
| Service methods | verb + business action | `createOrder`, `advanceStatus` |

## Import order

```typescript
// 1. Node built-ins
import crypto from "crypto";
// 2. External libraries
import type { Request, Response } from "express";
import { z } from "zod";
// 3. Internal shared (db, utils, types)
import pool from "../db/pool";
import { AppError } from "../utils/AppError";
// 4. Same-entity layers (repository, service, validation)
import { OrderRepository } from "../repositories/order.repository";
```

## SQL extras

- Add `JOIN`s only when the response needs them; no default JOINs.
- `RowDataPacket` for SELECT results, `ResultSetHeader` for INSERT/UPDATE/DELETE.
- Dynamic `ORDER BY`/column names only from an allow-list.

## JWT payload (`utils/jwt.ts`, `AccessTokenPayload`)

`{ userId, role, roleId?, parentClientId?, permissions?, tenantId? }`.
`userId` is a string. Sub-users carry `parentClientId` and `permissions`.
The refresh token only carries `{ userId }`. Never return tokens in responses.

## Order action endpoints (`routes/order.routes.ts`)

```
PATCH /api/orders/:id/status      change status (transitions validated in the service)
PATCH /api/orders/:id/receive     receive at the plant
PATCH /api/orders/:id/deliver     confirm delivery
PATCH /api/orders/:id/reassign    reassign driver
PATCH /api/orders/:id/reschedule  reschedule
PATCH /api/orders/bulk/deliver    bulk delivery (declare before /:id)
POST  /api/orders/export[/stained] CSV export (declare before /:id)
```

Check `order.routes.ts` before adding new endpoints.

## Checklist before delivering

1. SQL only in repositories, with `?` placeholders (dynamic columns from allow-lists).
2. Business/permission logic only in services; backend validates role + status.
3. Multi-table writes inside `withTransaction`; connections always released.
4. Zod schema on every body/params/query; routes protected.
5. Errors via `AppError`; responses via `sendSuccess`.
6. Order statuses use `OrderStatus`; DB mapping only in `order.repository.ts`.
7. No new `any`, no secrets, no unrelated refactors.
8. Mirror test added/updated; `npm test` and `npm run build` executed.
9. Schema change? migration script + base schema updated + documented impact.
10. API contract change? frontend impact reported.
