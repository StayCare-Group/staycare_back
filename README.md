# StayCare Backend

Backend API for the StayCare laundry management web application. Built with Express, TypeScript, and MongoDB. Uses JWT authentication with httpOnly cookies (access + refresh tokens).

---

## Informe general del aplicativo

### ¿Qué es?

API REST para **gestión operativa de lavandería B2B**: cuentas de usuario con roles, **empresas cliente** (`Clients`) con **propiedades** (direcciones), **pedidos** con ciclo de vida (recogida → instalación → entrega → facturación), **rutas de reparto** agrupadas por conductor y día, **facturas** y pagos, **catálogo de ítems**, **máquinas** de planta, **invitaciones** por email y **informes** agregados.

### Autenticación y acceso

- Los JWT van en **cookies httpOnly** (`accessToken`, `refreshToken`). El cliente debe enviar cookies (`credentials: 'include'` / `withCredentials: true`).
- **CORS:** el origen del front debe coincidir con `CLIENT_URL` y usarse `credentials: true` en el servidor.
- **401:** no hay sesión o token inválido/caducado. **403:** sesión válida pero **rol** no permitido en esa ruta, o (en algunos GET) recurso de **otro cliente**.
- Tras el **login** o **register**, las siguientes peticiones al mismo host/puerto llevan cookies automáticamente (p. ej. Postman).

### Modelos de datos (MongoDB / Mongoose)

| Colección | Rol en el sistema |
|-----------|-------------------|
| `User` | Login, rol, enlace opcional a `Clients` (`client`), `refresh_token` |
| `Clients` | Empresa + array embebido `properties[]` (cada una con `_id`) |
| `Orders` | Pedido: ref a `Clients`, opcional `property` (id de subdocumento), `deliver_id` → `User`, líneas y estados embebidos |
| `Invoices` | Factura: ref `Clients`, array de `Orders`, líneas y pagos embebidos |
| `Routes` | Ruta de reparto: `driver` → `User`, `orders[]` → `Orders` |
| `Machine` | Máquina; `current_order` → `Orders` |
| `Items` | Catálogo (sin FK desde pedidos; se copian datos en líneas del pedido) |
| `Invitation` | Invitación; `created_by` → `User` |
| `PasswordReset` | Tokens de recuperación de contraseña |

### Flujos que cruzan varios modelos

1. **Alta pedido:** escribe `Orders`; opcionalmente **`autoAssignRoute`** lee `User` (conductores), `Clients` (área vía propiedad), crea/actualiza `Routes` y actualiza el `Order` (Assigned + `deliver_id`).
2. **Entrega (`PATCH .../deliver`):** actualiza `Orders`; puede **crear** `Invoices` y pasar el pedido a estado facturado.
3. **Factura manual:** `POST /api/invoices` crea `Invoices` y puede marcar pedidos como `Invoiced` en `Orders`.

### Puerto en macOS

En muchos Mac el **puerto 5000** lo usa **AirPlay Receiver** (respuestas 403 vacías que no son Express). Usa otro puerto, p. ej. `PORT=5001` en `.env`.

---

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to all resources |
| `staff` | Operational access — manage clients, orders, routes, invoices, machines |
| `client` | Limited access — own profile, orders, invoices, and company/properties |
| `driver` | Pickup/delivery actions and own routes / assigned orders |

---

## Matriz: quién accede a qué (resumen)

| Área | admin | staff | client | driver | público |
|------|:-----:|:-----:|:------:|:------:|:-------:|
| Health `/` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Health `/admin` | ✓ | — | — | — | — |
| Auth register/login/refresh/logout/forgot/reset | ✓ | ✓ | ✓ | ✓ | ✓ |
| Auth me / password | ✓ | ✓ | ✓ | ✓ | — |
| Users CRUD | ✓ | lectura | — | — | — |
| Clients (lista, CRUD empresa) | ✓ | ✓ | —* | — | — |
| Clients GET `:id` | ✓ | ✓ | solo el suyo | — | — |
| Clients `/self` y propiedades self | ✓† | ✓† | ✓‡ | — | — |
| Orders crear | ✓ | ✓ | ✓ | — | — |
| Orders listar / ver | ✓ | ✓ | filtrado | filtrado | — |
| Orders editar / estado / receive / reassign | ✓ | ✓ | — | — | — |
| Orders pickup / deliver | ✓ | — | — | ✓ | — |
| Orders reschedule | ✓ | ✓ | solo suyo | — | — |
| Orders delete | ✓ | — | — | — | — |
| Invoices crear / pagos / mark-overdue | ✓ | ✓ (no overdue) | — | — | — |
| Invoices leer | ✓ | ✓ | solo suyas | — | — |
| Items GET | ✓ | ✓ | ✓ | ✓ | ✓ |
| Items escritura / seed | ✓ | — | — | — | — |
| Routes CRUD / PUT | ✓ | ✓ | — | — | — |
| Routes listar / ver | ✓ | ✓ | ✓ | ✓ (filtrado) | — |
| Routes PATCH status | ✓ | ✓ | — | ✓ | — |
| Facility máquinas | ✓ CRUD | ✓ lectura/assign/release/seed | — | — | — |
| Invitations | ✓ | — | — | — | validate/register público |
| Reports | ✓ | ✓ | — | — | — |

\* *Client no usa `GET /` de clients; ve su empresa vía `GET /:id` si coincide con `User.client`.*  
† *admin/staff pueden usar `/self` para crear empresa vinculada al usuario actual en flujos de prueba.*  
‡ *client gestiona propiedades solo en rutas `/self/properties`.*

---

## Qué puede **crear** cada rol (recursos nuevos)

| Rol | Puede crear (endpoints principales) |
|-----|-------------------------------------|
| **Público** | Usuario vía `POST /api/auth/register`; validar/registrar invitación; lectura catálogo ítems |
| **admin** | Usuarios, clientes, pedidos, facturas, ítems, rutas, máquinas, invitaciones; casi todos los deletes |
| **staff** | Clientes, pedidos, facturas (no `mark-overdue`), rutas, pagos; asignar/liberar máquinas; seed máquinas |
| **client** | Empresa propia `POST /clients/self`, propiedades `.../self/properties`, pedidos propios; reprogramar solo sus pedidos |
| **driver** | No hay “create” dedicado: actúa sobre pedidos (pickup/deliver) y estado de ruta |

---

## Tech stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Language:** TypeScript
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT (jsonwebtoken), bcryptjs, cookie-parser
- **Validation:** Zod
- **Email:** Nodemailer (SMTP)

## Prerequisites

- Node.js (v18+)
- MongoDB (local or Atlas)
- npm or yarn

## Installation

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | MongoDB connection string | `mongodb+srv://...` |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing access tokens | Strong random string |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing refresh tokens | Different strong random string |
| `PORT` | No | Server port (default: 5000). On macOS consider `5001` if 5000 is AirPlay. | `5001` |
| `NODE_ENV` | No | Runtime environment | `development` / `production` |
| `CLIENT_URL` | No | Allowed CORS origin (frontend URL), exact match | `http://localhost:5173` |
| `ACCESS_TOKEN_EXPIRES` | No | Access token lifetime in seconds (default: 900) | `900` |
| `REFRESH_TOKEN_EXPIRES` | No | Refresh token lifetime in seconds (default: 604800) | `604800` |
| `SMTP_HOST` | No | SMTP server host | `smtp.gmail.com` |
| `SMTP_PORT` | No | SMTP server port | `587` |
| `SMTP_SECURE` | No | Use TLS (`true`/`false`) | `false` |
| `SMTP_USER` | No | SMTP username / email | `your-email@gmail.com` |
| `SMTP_PASS` | No | SMTP password / app password | `your-app-password` |
| `SMTP_FROM` | No | Sender address shown on emails | `StayCare <your-email@gmail.com>` |

> **Note:** `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` are required — the server will exit on startup if any are missing.

**Security:** In production, use long random secrets and never commit `.env`. Set `NODE_ENV=production` so cookies use `secure: true`.

## Running the server

```bash
npm run dev
```

Starts the server with hot reload (default port from `PORT` or 5000). Connects to MongoDB on startup.

---

## API overview

Base URL: `http://localhost:PORT` (e.g. `http://localhost:5001`).

All authenticated requests must send cookies (`credentials: 'include'` in fetch or `withCredentials: true` in axios). The frontend origin must match `CLIENT_URL`.

**List endpoints** often support `page` and `limit` (default limit 25, max 100).

---

### Authentication (`/api/auth`)

Tokens are stored in **httpOnly cookies** only — not required in `Authorization` header for this API.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register a new user. Sets cookies. Optional `role` in body (lock down in production if needed). |
| POST | `/api/auth/login` | No | Login. Sets `accessToken` and `refreshToken` cookies. |
| POST | `/api/auth/refresh` | No (refresh cookie) | Issue a new access token. |
| POST | `/api/auth/logout` | No (cookies) | Invalidate refresh token and clear cookies. |
| GET | `/api/auth/me` | Yes | Get the current user's profile (`populate client`). |
| PATCH | `/api/auth/me` | Yes | Update name, email, phone, or language. |
| PATCH | `/api/auth/password` | Yes | Change password (`current_password`, `new_password`). |
| POST | `/api/auth/forgot-password` | No | Body: `{ "email" }` — password-reset flow. |
| POST | `/api/auth/reset-password/:token` | No | Body: `{ "password" }`. |

**Login request:**
```json
{ "email": "user@example.com", "password": "password123" }
```

**Login success (200):** Sets `accessToken` (15 min) and `refreshToken` (7 days) cookies and returns user info.

**Errors:** `401` invalid credentials; `400` validation error.

---

### Users (`/api/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users` | admin | Create user (`createUserSchema`: name, email, password, optional phone, language, role, client). |
| GET | `/api/users` | admin, staff | List users. Query: `page`, `limit`, `role`, `is_active`. |
| GET | `/api/users/:id` | admin, staff | Get user by ID. |
| PUT | `/api/users/:id` | admin | Update user (optional `password` rotates hash). |
| DELETE | `/api/users/:id` | admin | Soft-deactivate (`is_active: false`). |

---

### Clients (`/api/clients`)

All routes require authentication.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/clients` | admin, staff | Create client company. |
| GET | `/api/clients` | admin, staff | List clients. |
| GET | `/api/clients/:id` | admin, staff, client | Get client; client only if `id` matches linked `User.client`. |
| PUT | `/api/clients/:id` | admin, staff | Update client. |
| DELETE | `/api/clients/:id` | admin | Delete client. |
| POST | `/api/clients/self` | client, admin, staff | Create company and link to current user. |
| POST | `/api/clients/self/properties` | client | Add property to own company. |
| PUT | `/api/clients/self/properties/:propertyId` | client | Update own property. |
| DELETE | `/api/clients/self/properties/:propertyId` | client | Delete own property. |
| POST | `/api/clients/:id/properties` | admin, staff | Add property. |
| PUT | `/api/clients/:id/properties/:propertyId` | admin, staff | Update property. |
| DELETE | `/api/clients/:id/properties/:propertyId` | admin, staff | Delete property. |

---

### Orders (`/api/orders`)

All routes require authentication. **Property** on create must be a `properties[i]._id` from `GET /api/clients/:clientId` for that same client (or omit `property`).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/orders` | admin, staff, client | Create order. Staff/admin must send `client` id; client uses linked company. |
| GET | `/api/orders` | authenticated | Filtered by role (client/driver see subset). |
| GET | `/api/orders/:id` | authenticated | Get order; client only own. |
| PUT | `/api/orders/:id` | admin, staff | Update order (rules by status). |
| DELETE | `/api/orders/:id` | admin | Delete only if `Pending`. |
| PATCH | `/api/orders/:id/status` | admin, staff | Change status + history. |
| PATCH | `/api/orders/:id/pickup` | driver, admin | Confirm pickup. |
| PATCH | `/api/orders/:id/receive` | staff, admin | Receive at facility. |
| PATCH | `/api/orders/:id/deliver` | driver, admin | Confirm delivery; may create invoice. |
| PATCH | `/api/orders/:id/reassign` | admin, staff | Body: `{ "driver_id" }`. |
| PATCH | `/api/orders/:id/reschedule` | admin, staff, client | Client only own order. |

---

### Invoices (`/api/invoices`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/invoices` | admin, staff | Create invoice (`createInvoiceSchema`). |
| GET | `/api/invoices` | admin, staff, client | List; client filtered to own. |
| GET | `/api/invoices/:id` | admin, staff, client | Get; client only own. |
| POST | `/api/invoices/:id/payments` | admin, staff | Record payment. |
| POST | `/api/invoices/mark-overdue` | admin | Mark overdue. |

---

### Items (`/api/items`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/items` | public | List catalog. |
| GET | `/api/items/:id` | public | Get item. |
| POST | `/api/items` | admin | Create (`createItemSchema`). |
| PATCH | `/api/items/:id` | admin | Partial update. |
| PUT | `/api/items/:id` | admin | Update. |
| DELETE | `/api/items/:id` | admin | Delete. |
| POST | `/api/items/seed` | admin | Seed catalog. |

---

### Routes (`/api/routes`)

Delivery routes (not Express routes).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/routes` | admin, staff | Create route; may assign orders. |
| GET | `/api/routes` | authenticated | List; driver filtered to own. |
| GET | `/api/routes/:id` | authenticated | Get route. |
| PUT | `/api/routes/:id` | admin, staff | Update route. |
| PATCH | `/api/routes/:id/status` | admin, staff, driver | Route status. |
| DELETE | `/api/routes/:id` | admin | Delete only if `planned`. |

---

### Facility / Machines (`/api/facility`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/facility/machines` | admin, staff | List machines + status. |
| POST | `/api/facility/machines` | admin | Create machine (`name`, `type`, `capacity`, …). |
| PUT | `/api/facility/machines/:id` | admin | Update machine. |
| DELETE | `/api/facility/machines/:id` | admin | Delete if not running. |
| POST | `/api/facility/machines/:id/assign` | admin, staff | Body: `{ "order_id" }`. |
| POST | `/api/facility/machines/:id/release` | admin, staff | Release machine. |
| POST | `/api/facility/machines/seed` | admin, staff | Seed default machines. |

---

### Invitations (`/api/invitations`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/invitations` | admin | Create invitation (`email`, `role`: admin/driver/staff). |
| GET | `/api/invitations` | admin | List invitations. |
| GET | `/api/invitations/:token/validate` | No | Validate token. |
| POST | `/api/invitations/:token/register` | No | Register via invite (`registerViaInviteSchema`). |

---

### Reports (`/api/reports`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/dashboard` | admin, staff | Dashboard aggregates. |
| GET | `/api/reports/revenue` | admin, staff | Revenue by month (`?months=`). |
| GET | `/api/reports/orders-by-client` | admin, staff | Orders per client. |
| GET | `/api/reports/sla` | admin, staff | SLA metrics. |

---

### Health (`/api/health`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Liveness. |
| GET | `/api/health/admin` | admin | Liveness + auth check. |

---

## Authentication details

### Token types

- **Access token:** Short-lived (default 15 min). Payload: `{ userId, role }`. Read from the `accessToken` cookie by the `authenticate` middleware.
- **Refresh token:** Long-lived (default 7 days). Payload: `{ userId }`. Stored in the DB on the user document and sent in the `refreshToken` cookie. Used only by `/api/auth/refresh` and `/api/auth/logout`.

### Cookie settings

- `httpOnly: true` — not readable by JavaScript.
- `sameSite: "strict"` in development; `none` + `secure` in production for cross-site setups.
- `secure: true` in production (`NODE_ENV=production`).
- `maxAge` set to match token expiry.

### Protecting routes

1. **Require login:** `authenticate` reads `accessToken`, sets `req.user = { userId, role }`. Returns `401` if missing or invalid.

2. **Require a role:** chain `authenticate` then `authorize(...roles)`:

```ts
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

router.get("/admin/dashboard", authenticate, authorize("admin"), handler);
router.get("/data", authenticate, authorize("admin", "staff"), handler);
```

### Status codes

- **401 Unauthorized** — Not logged in, or invalid/expired token.
- **403 Forbidden** — Logged in but role not allowed, or client accessing another client's resource.

---

## Project structure

```
StayCare-Backend/
├── src/
│   ├── app.ts              # Express app, middleware, route mounting
│   ├── server.ts           # Entry point, DB connect, listen
│   ├── config/
│   │   ├── db.ts           # MongoDB connection
│   │   └── env.ts          # Env var validation (exits on missing required vars)
│   ├── controllers/        # Route handler logic (one file per resource)
│   ├── middleware/
│   │   ├── authenticate.ts # JWT from cookie → req.user
│   │   ├── authorize.ts    # Role check, supports multiple roles
│   │   ├── errorHandler.ts # Centralised error response
│   │   └── validate.ts     # Zod schema validation
│   ├── models/             # Mongoose models (User, Clients, Orders, ...)
│   ├── routes/             # Express routers (one file per resource)
│   ├── utils/
│   │   ├── jwt.ts          # Sign/verify tokens, cookie options
│   │   ├── mail.ts         # Nodemailer helpers (invitation, password reset, order status)
│   │   ├── autoAssignRoute.ts
│   │   ├── paginate.ts
│   │   ├── response.ts
│   │   └── AppError.ts
│   └── validation/         # Zod schemas (one file per resource)
├── http/                   # Sample HTTP requests (REST Client extension)
├── .env.example            # Environment variable template
├── package.json
└── README.md
```

---

## Security summary

- Passwords hashed with bcrypt (bcryptjs); never returned in API responses.
- JWTs in httpOnly cookies; not returned in JSON for session establishment beyond user metadata.
- Refresh tokens stored in DB and cleared on logout; stale tokens are rejected.
- CORS: `CLIENT_URL` + `credentials: true`.
- Access and refresh tokens use different secrets and expiry times.
- Required env vars validated at startup.

---

## Example HTTP requests

See the `http/` folder for sample requests (`login.http`, `refresh.http`, `logout.http`, `createUser.http`, etc.) for use with the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VS Code extension.
