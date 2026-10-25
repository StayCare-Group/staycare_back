---
description: Investigate and fix a StayCare backend bug (root cause first, smallest complete fix)
---

# Fix a backend bug

## Investigation
1. Describe observed vs. expected behavior.
2. Reproduce or trace it (route → controller → service → repository → SQL).
3. Check how the frontend calls the endpoint and what it expects.
4. Verify permissions, order statuses, manual vs. route-based flow, related data.
5. Identify the root cause; check similar flows for the same problem.

## Implementation
1. Explain the proposed solution.
2. Implement the smallest complete fix; no unrelated refactors.
3. Preserve behavior for unaffected roles and flows.
4. Add or update the mirror test in `src/__tests__/`.

## Verification
Authorized/unauthorized roles, valid/invalid statuses, missing driver/route,
repeated or concurrent requests, transaction rollback, pagination edge cases.
Run `npm test` and `npm run build`.

## Final report
Root cause · files changed · changes · commands executed · DB impact ·
API contract impact · remaining risks. Never claim a test passed unless it ran.
