# StayCare Backend

Backend API for the StayCare laundry management web application. Built with Express, TypeScript, and MySQL. Uses JWT authentication with httpOnly cookies (access + refresh tokens).

---

## Technical Overview

### Architecture
The project follows a clean **4-layer architecture**:
1.  **Repositories**: Data access and Raw SQL operations (using `mysql2/promise`).
2.  **Services**: Business logic, transactions, and validation.
3.  **Controllers**: Request handling and success/error responses.
4.  **Schemas (Zod)**: Request validation and type definitions.

### Database (MySQL)
The system is fully migrated to MySQL. The schema includes support for RBAC, multi-client properties, order tracking with status history, automated invoicing, and plant machinery management.

### Authentication
- JWTs are stored in **httpOnly cookies** (`accessToken`, `refreshToken`).
- **CORS:** The frontend origin must match `CLIENT_URL` and use `credentials: true`.
- **RBAC:** Roles available: `admin`, `staff`, `client`, `driver`.

---

## Getting Started (Docker)

The fastest way to run the entire stack (Backend + MySQL) is using Docker Compose.

1.  **Clone the repository** (if not already done).
2.  **Environment Variables**: Create a `.env` file from the example (though the `docker-compose.yml` provides defaults).
3.  **Launch**:
    ```bash
    docker compose up --build -d
    ```
4.  **Access**:
    -   API: `http://localhost:5000`
    - **Host**: `localhost`
    - **Port**: `3307`
    - **User**: `staycare_dev`
    -   Swagger docs: `http://localhost:5000/api-docs`

### Comandos útiles una vez iniciado:
- **Ver los logs del backend** (para depurar):
  ```bash
  docker compose logs -f backend
  ```
- **Detener todo el entorno**:
  ```bash
  docker compose down
  ```
- **Reiniciar solo el backend** (si haces cambios en el código):
  ```bash
  docker compose restart backend
  ```

---

## Manual Installation (Development)

### Prerequisites
- Node.js (v18+)
- MySQL (v8.0)

### Setup
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Prepare Database**:
    -   Create a database named `staycare`.
    -   Run the initialization script: `docs/migration/staycare_mysql.sql`
        -   All primary and foreign keys use UUID (`CHAR(36)`)
        -   Seed users and roles included
3.  **Configure `.env`**:
    ```bash
    cp .env.example .env
    ```
    Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.

### Running
```bash
npm run dev
```

---

## Roles & Permissions

| Role | Description |
|------|-------------|
| `admin` | Full access to all resources. |
| `staff` | Plant operation, clients, orders, and invoices. |
| `client` | Own orders, invoices, and company properties. |
| `driver` | Assigned routes and pickup/delivery actions. |

---

## Project Structure

```
StayCare-Backend/
├── src/
│   ├── app.ts              # Express application & middleware
│   ├── server.ts           # Entry point & server listener
│   ├── config/             # Env & global config
│   ├── controllers/        # Request handlers
│   ├── db/                 # MySQL pool connection
│   ├── middleware/         # Auth, Role, Validation middlewares
│   ├── repositories/       # DATA LAYER: Raw SQL queries
│   ├── services/           # BUSINESS LAYER: Logic & Decisions
│   ├── routes/             # API Route definitions
│   ├── utils/              # JWT, Mail, Pagination, AppError
│   └── validation/         # Zod schemas for validation
├── docs/
│   └── migration/          # MySQL main schema script
├── Dockerfile              # Production container build
├── docker-compose.yml      # Local dev stack (MySQL + App)
└── README.md
```

---

## Security
- Passwords hashed with **bcryptjs**.
- Access tokens (Short-lived) / Refresh tokens (Long-lived).
- No sensitive data returned in API responses.
- Automated error handling with `AppError` and custom middleware.

---

## API Documentation
The API is fully documented using **Swagger**. Once the server is running, visit:
`http://localhost:5000/api-docs`
