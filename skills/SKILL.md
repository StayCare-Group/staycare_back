---
name: staycare-backend
description: Estándar de arquitectura y código para el backend de StayCare.
Úsalo siempre que generes controladores, validaciones, middlewares,
rutas o cualquier archivo del proyecto StayCare-Backend.
---

# Skill: StayCare Backend

## Qué es este proyecto
API REST de gestión operativa para lavanderías B2B.
Gestiona el ciclo completo de un pedido: solicitud → recogida → planta → entrega → facturación.

## Stack
- Runtime: Node.js 20 LTS
- Framework: Express 4 + TypeScript 5
- Base de datos: MySQL 8 via mysql2/promise (queries SQL raw, sin ORM)
- Auth: JWT en cookies httpOnly (accessToken 15min + refreshToken 7 días)
- Validación: Zod
- Encriptación: bcryptjs
- IDs: INT UNSIGNED AUTO_INCREMENT (MySQL nativo)

## Cuándo usar este Skill
- Si vas a crear o editar un controlador
- Si vas a crear queries SQL
- Si vas a crear rutas de Express
- Si vas a crear schemas de validación Zod
- Si vas a crear middlewares
- Si vas a manejar errores o respuestas HTTP

## Regla número 1
El controlador solo recibe el request, llama al servicio y devuelve la respuesta.
Nunca escribas SQL en un controlador. Nunca escribas lógica de negocio en un controlador.

## Dónde mirar según el tipo de tarea
- Estructura de carpetas y capas: recursos/arquitectura.md
- Patrones de código por capa: recursos/patrones.md
- Nomenclatura y convenciones: recursos/convenios-codigo.md

## Módulos del sistema (11 módulos)
| Módulo      | Prefijo API        | Tablas principales          |
|-------------|--------------------|-----------------------------|
| auth        | /api/auth          | users, password_resets      |
| users       | /api/users         | users                       |
| clients     | /api/clients       | clients, properties         |
| orders      | /api/orders        | orders, order_items, order_status_history, order_photos |
| routes      | /api/routes        | routes, route_orders        |
| facility    | /api/facility      | machines                    |
| invoices    | /api/invoices      | invoices, invoice_orders, invoice_line_items, invoice_payments |
| items       | /api/items         | items                       |
| invitations | /api/invitations   | invitations                 |
| reports     | /api/reports       | (agregaciones multi-tabla)  |
| health      | /api/health        | —                           |

## Roles del sistema
admin · staff · driver · client
Middleware: authenticate → authorize(...roles) → validate(schema) → controller

## Estados del pedido (13)
Pending → Assigned → Transit → Arrived → Washing → Drying → Ironing →
QualityCheck → ReadyToDeliver → Collected → Delivered → Invoiced → Completed

## Checklist antes de entregar código
1. ¿El SQL está solo en el repositorio (*.repository.ts)?
2. ¿La lógica de negocio está solo en el servicio (*.service.ts)?
3. ¿El controlador valida con Zod antes de llamar al servicio?
4. ¿Los errores usan AppError(message, statusCode)?
5. ¿Las rutas protegidas tienen authenticate + authorize?
6. ¿Las respuestas usan sendSuccess / sendError de response.ts?
7. ¿No hay ningún "any" en TypeScript?
8. ¿Los queries SQL usan parámetros preparados (?) y nunca concatenación de strings?
