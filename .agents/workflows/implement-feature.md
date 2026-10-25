---
description: Plan and implement a StayCare backend feature end to end
---

# Implement a backend feature

## Planning (present a concise plan before cross-cutting changes)
Identify: user flow, affected roles/permissions, affected order statuses and
transitions, endpoints and API contract (request/response/pagination),
DB impact (tables, indexes, migration), frontend impact, test scenarios.

## Implementation
- Follow the layers: route → controller → service → repository.
- Validate permissions and transitions in the service.
- Keep route-based and manual flows independent.
- Add Zod schema, Swagger docs and (if needed) a migration script **and** the
  base schema update.
- No new libraries without asking.

## Edge cases
Unauthorized roles, invalid status, missing route/driver/stop, repeated clicks
and duplicate requests, concurrent updates (`findByIdForUpdate`), legacy data,
network/DB failure, large result sets (paginate, index).

## Verification and report
Run `npm test` and `npm run build`. Report: summary · files · business
decisions · tests executed · API/DB impact · remaining risks.
