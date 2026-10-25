---
trigger: model_decision
description: Apply when creating or modifying backend code that has testable logic, or when writing/fixing tests.
---

# Backend Testing Rules

Runner: Vitest (`npm test` = `vitest run`, environment `node`, files
`src/**/*.test.ts`). A local git `pre-commit` hook runs `npm test`; all tests
must pass. (Hooks live in `.git/hooks` and are not versioned: re-create
`pre-commit` with `npm test` after cloning.)

## Workflow when creating or modifying a file

1. Check for a mirror test in `src/__tests__/` (same subfolder, `<name>.test.ts`).
2. If it exists, update/add cases for the new behavior.
3. If not, create one when the file has testable logic (pricing, mapping,
   permission checks, status transitions, validation, pagination).
4. If a test is hard to write because the code mixes responsibilities
   (SQL + business rules), consider moving the pure logic out.

## Mirror structure

```
src/services/order.service.ts       → src/__tests__/services/order.service.test.ts
src/repositories/order.repository.ts → src/__tests__/repositories/order.repository.test.ts
src/controllers/order.controller.ts → src/__tests__/controllers/orderExport.test.ts
```

## Practices

- Mock the repository layer / `pool` in service tests; do not hit a real DB.
- Cover: permissions per role, invalid current status, missing driver/route
  (manual flows), `null`/empty inputs, transaction rollback on failure.
- High priority: pricing/VAT math, role/permission logic, status transitions,
  DB↔API status mapping, export filters.
- Use `beforeEach(() => vi.clearAllMocks())`.
- Do not test Express/mysql2 internals.
- Never report a test as passing unless it was executed; also run
  `npm run build` (`tsc`) to type-check before finishing.
- Scratch/manual scripts belong in `tmp/` (not production code, not tests).
