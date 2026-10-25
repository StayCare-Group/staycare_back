---
trigger: always_on
---

# Engineering Principles (Backend)

## Analysis before modification

1. Inspect the relevant routes, controllers, services, repositories,
   validators and DB tables.
2. Inspect how the frontend consumes the endpoint (request/response contract).
3. Confirm affected roles, permissions and order statuses.
4. Identify the root cause; do not patch symptoms.
5. Explain the approach before large or cross-cutting changes.

## Business rules

- Do not invent statuses, roles, permissions or transitions.
- Reuse existing enums, constants, types and helpers.
- Do not assume a driver, route or route stop exists (manual flows).
- Preserve route-based flows when changing manual flows (and vice versa).
- Validate permissions and transitions in the backend, always.
- Search all usages before renaming shared statuses, types or properties.

## Coding rules

- Follow existing architecture and naming; small, reviewable changes.
- No unrelated refactors. No new libraries without asking first.
- No duplicated business/permission/status logic.
- No empty `catch`, forced casts or arbitrary fallbacks that hide failures.
- Prefer no new `any`; use `RowDataPacket`/`ResultSetHeader` for mysql2.
- Preserve backward compatibility of the API unless a contract change is
  explicitly requested (the frontend is deployed separately).
- Reuse design-quality principles when they bring clear value: SOLID, DRY,
  KISS, YAGNI, separation of concerns.

## Refactoring

Before refactoring: state the concrete problem, affected files/behavior and
why it is needed now. Do not mix large refactors with bug fixes. Report
out-of-scope problems separately, ranked Critical/High/Medium/Low.

## Final report (after every change)

1. Root cause or feature summary
2. Files changed
3. Business decisions
4. Tests and commands actually executed
5. Database impact (migration needed?)
6. API contract impact (frontend change needed?)
7. Remaining risks / manual checks
