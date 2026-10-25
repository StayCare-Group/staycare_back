---
description: Read-only review of backend code quality and architecture (no code changes until scope is approved)
---

# Review backend code quality

Analyze the requested area **without modifying code**. Review: layer
responsibilities, SQL outside repositories, business logic in controllers,
duplicated status/permission logic, large functions, coupling, connection and
transaction handling (leaks, nested connections, slow work inside
transactions), error handling consistency (`AppError` vs ad-hoc errors),
`any` usage, missing validation, N+1 queries, missing indexes, testability,
SOLID/DRY/KISS/YAGNI. Do not recommend a full rewrite.

For each finding give: severity (Critical/High/Medium/Low/Optional), file and
location, current problem, practical impact, recommended improvement,
estimated risk, fix-now vs. track-later.

Group into **Must fix**, **Should fix**, **Future improvement**.
Do not modify code until the refactoring scope is approved.
