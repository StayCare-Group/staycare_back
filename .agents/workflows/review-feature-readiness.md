---
description: Check that a backend change is ready to commit/merge (checks, contract, DB, security)
---

# Review feature readiness (backend)

Verify and report each item with evidence (command output or file reference):

1. `npm test` passes; `npm run build` (tsc) passes.
2. Mirror tests exist/updated for new logic.
3. Roles and permissions enforced in routes **and** services.
4. Order status transitions validated in the backend; DB mapping untouched or migrated.
5. Zod validation on all inputs; Swagger updated.
6. Transactions/connections correct (released in `finally`, no nested connections).
7. API contract backward compatible; frontend impact listed.
8. Migration script + base schema updated if the schema changed; indexes considered.
9. No secrets, `.env` or credentials in the diff; `.env.example` updated with placeholders.
10. No unrelated changes, dead code or leftover debug logging.

Output: ready / not ready, blocking issues, non-blocking issues, manual checks pending.
