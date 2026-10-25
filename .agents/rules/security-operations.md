---
trigger: always_on
---

# Security and Operations

Never expose, print, commit or modify: production credentials, DB passwords,
tokens, `.env` contents, JWT secrets, SMTP credentials or cloud-provider
credentials. Only `.env.example` (placeholders) is versioned.

Do **not** unless explicitly requested and approved:

- Deploy, push, merge, or touch production configuration
- Run production migrations or delete production data
- Reset or clean the database (including `db:*:dev` scripts against non-local DBs)

## Application security rules

- `password_hash`, refresh tokens and JWTs are never returned in responses.
- Cookies are `httpOnly`; in production `secure: true` and `sameSite: 'none'`.
- SQL uses `?` placeholders. Never concatenate user input into SQL.
  Dynamic `ORDER BY`/column names must come from an allow-list.
- Public registration is disabled: `POST /api/auth/register` needs an admin
  session (`registerAuthGate`).
- Production errors return a generic message (`errorHandler`); never leak stacks.
- Clients may only access their own data (and a sub-user their parent's);
  enforce ownership in services, not only in routes.
- DB pool uses SSL (`rejectUnauthorized: false`) outside `development`
  (external managed MySQL on Render). Do not weaken other pool options
  (`multipleStatements: false`, `timezone: 'Z'`, `queueLimit`, timeouts).
- Run `npm audit` before dependency changes; do not add libraries without asking.
