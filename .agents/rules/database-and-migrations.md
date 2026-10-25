---
trigger: model_decision
description: Apply when touching SQL, repositories, DB pool/connections, transactions, migrations, indexes or schema changes.
---

# Database, Connections and Migrations

## Pool and connections (`src/db/pool.ts`, `config/index.ts`)

- One shared `mysql2` pool. Tunable by env: `DB_POOL_SIZE` (default 10),
  `DB_QUEUE_LIMIT` (100, fails fast instead of hanging), `DB_CONNECT_TIMEOUT_MS`
  (10000). Documented in `.env.example`.
- **`pool`** = the shared pool (each query borrows and returns a connection).
  **`conn`** = one specific connection borrowed with `pool.getConnection()`;
  it is the only way to run several queries in the same transaction.
- Repository methods that can be used inside a larger operation accept an
  optional `conn` and do `const db = conn ?? pool` (see `priceList.repository.ts`).
  Pass `conn` through when called inside a transaction or an already-open
  connection; otherwise leave it undefined.

## Rules

- Open a connection only when you need a transaction or several dependent
  queries on the same connection. Always `release()` in `finally`.
- Prefer `withTransaction(async (conn) => { ... })` (`db/transaction.ts`): it
  begins, commits, rolls back and releases. Do not hand-roll it.
- Any operation touching more than one table that must succeed or fail as a
  unit uses a transaction. Use `findByIdForUpdate(conn, id)` for status
  transitions to prevent concurrent updates.
- Never hold a connection while doing slow non-DB work (email, HTTP, PDF).
  Fetch what you need, release, then do the slow work.
- Keep transactions short; do not nest `getConnection()` inside a transaction
  (it can exhaust the pool and deadlock).

## Schema and migrations

- Base schema: `docs/migration/staycare_mysql.sql` (used by Docker init and
  `db:schema:dev`). Incremental changes: `scripts/migrations/<verb>_<what>.sql`
  (and `docs/migration/` for older ones).
- Every schema change = **both** an incremental migration script **and** the
  base schema file updated, so fresh and existing databases converge.
- Migrations must be backward compatible with the currently deployed
  frontend/API during rollout (add nullable columns/indexes first).
- Never run migrations against production without explicit approval; describe
  the exact SQL and expected impact instead.
- `orders.status` is stored PascalCase; the app uses snake_case via
  `toDbOrderStatus`/`fromDbOrderStatus`. Changing the DB enum requires a
  migration plus updating that mapping and the frontend `normalizeStatus`.
- Add indexes for new filter/sort/date-range columns on large tables
  (see `add_created_at_index_to_orders.sql`, `add_invoices_indexes.sql`).
- Dev-only helpers (`npm run db:*:dev`, `bootstrapDev.ts`) refuse to run
  outside `NODE_ENV=development`. Never weaken that guard.
