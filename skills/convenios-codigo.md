# Convenciones de código — StayCare Backend

## Nomenclatura

| Elemento           | Convención         | Ejemplo                        |
|--------------------|--------------------|--------------------------------|
| Archivos           | kebab-case         | order.service.ts               |
| Clases             | PascalCase         | AppError                       |
| Interfaces / Types | PascalCase con I   | IOrder, CreateOrderDTO         |
| Variables          | camelCase          | orderId, clientName            |
| Constantes         | UPPER_SNAKE_CASE   | SALT_ROUNDS, JWT_SECRET        |
| Rutas API          | kebab-case plural  | /api/orders, /api/order-items  |
| Tablas BD          | snake_case plural  | orders, order_items            |
| Columnas BD        | snake_case         | deliver_id, created_at         |
| Funciones repo     | verbo + entidad    | findOrderById, insertOrder     |
| Funciones service  | verbo + negocio    | createOrder, confirmPickup     |
| Funciones ctrl     | verbo + entidad    | getOrderById, createOrder      |

## Estructura de respuesta estándar

### Éxito
```json
{
  "success": true,
  "message": "Order retrieved",
  "data": { "order": { ... } }
}
```

### Éxito paginado
```json
{
  "success": true,
  "message": "Orders retrieved",
  "data": { "orders": [...] },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "pages": 5
  }
}
```

### Error
```json
{
  "success": false,
  "message": "Order not found"
}
```

## Códigos HTTP usados

| Código | Cuándo usarlo                                      |
|--------|----------------------------------------------------|
| 200    | GET exitoso, PATCH/PUT exitoso                     |
| 201    | POST exitoso (recurso creado)                      |
| 400    | Validación fallida, error genérico del cliente     |
| 401    | No autenticado (falta token o token inválido)      |
| 403    | Autenticado pero sin permiso (rol incorrecto)      |
| 404    | Recurso no encontrado                              |
| 409    | Conflicto (email duplicado, estado inválido, etc.) |
| 500    | Error interno del servidor                         |

## Reglas de SQL

- Siempre usar parámetros preparados: `WHERE id = ?` — NUNCA `WHERE id = ${id}`
- Todo SQL va en el repository, nunca en service ni controller
- Los JOINs solo cuando son necesarios para la respuesta — no hacer JOINs por defecto
- Usar transacciones cuando una operación toca más de una tabla
- Las fechas siempre se guardan en UTC
- Los IDs son INT UNSIGNED AUTO_INCREMENT — nunca UUID en StayCare

## Reglas de TypeScript

- Sin `any` — usar tipos explícitos siempre
- Los tipos de mysql2 a usar: `RowDataPacket[]` para SELECTs, `ResultSetHeader` para INSERT/UPDATE/DELETE
- Los DTOs de entrada se tipan como interfaces: `CreateOrderDTO`, `UpdateStatusDTO`
- El payload del JWT es `{ userId: string; role: UserRole }` — userId es string aunque el ID en BD sea INT

## Orden de imports en cada archivo

```typescript
// 1. Node.js built-ins
import crypto from 'crypto';

// 2. Librerías externas
import { Request, Response } from 'express';
import { z } from 'zod';

// 3. Config / shared internos
import { pool } from '../../config/db';
import { AppError } from '../../shared/utils/AppError';
import { sendSuccess, sendError } from '../../shared/utils/response';

// 4. Módulo actual
import * as orderRepo from './order.repository';
```

## Endpoints por módulo

```
GET    /api/[modulo]         → listar con paginación y filtros
GET    /api/[modulo]/:id     → obtener uno por ID
POST   /api/[modulo]         → crear
PUT    /api/[modulo]/:id     → reemplazar completo
PATCH  /api/[modulo]/:id     → actualizar parcialmente
DELETE /api/[modulo]/:id     → eliminar
```

Endpoints de acción adicionales (específicos de StayCare):
```
PATCH  /api/orders/:id/status     → cambiar estado del pedido
PATCH  /api/orders/:id/pickup     → confirmar recogida (driver)
PATCH  /api/orders/:id/receive    → recibir en planta (staff)
PATCH  /api/orders/:id/deliver    → confirmar entrega (driver)
PATCH  /api/orders/:id/reassign   → reasignar conductor
PATCH  /api/orders/:id/reschedule → reprogramar pedido
PATCH  /api/routes/:id/status     → cambiar estado de ruta
```

## Reglas de seguridad

- Los tokens JWT nunca se exponen en respuestas del API
- `refresh_token` de la tabla users nunca se devuelve en SELECTs normales
- `password_hash` nunca se devuelve en ninguna respuesta
- Las cookies siempre son `httpOnly: true`
- En producción las cookies usan `sameSite: 'none'` y `secure: true`
- role='client' solo se puede asignar en registro público — los roles privilegiados solo via /api/users o invitaciones
