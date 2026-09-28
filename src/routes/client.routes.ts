import { Router } from "express";
import {
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  getAllPermissions,
  getClientRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  getClientSubUsers,
  getClientSubUserById,
  createClientSubUser,
  updateClientSubUser,
  deleteClientSubUser,
} from "../controllers/client.controller";
import { validate } from "../middleware/validate";
import { updateClientSchema } from "../validation/client.validation";
import { createCustomRoleSchema, updateCustomRoleSchema } from "../validation/role.validation";
import { createSubUserSchema, updateSubUserSchema } from "../validation/subUser.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// ─── Permissions ──────────────────────────────────────────────────────────────
router.get("/permissions", authorize("admin", "staff", "client"), getAllPermissions);

// ─── Base Client CRUD ─────────────────────────────────────────────────────────
router.get("/", authorize("admin", "staff"), getAllClients);
router.get("/:id", authorize("admin", "staff", "client"), getClientById);
router.put(
  "/:id",
  authorize("admin", "staff"),
  validate(updateClientSchema),
  updateClient,
);
router.delete("/:id", authorize("admin"), deleteClient);

// ─── Custom Roles per Client ──────────────────────────────────────────────────
router.get("/:id/roles", authorize("admin", "staff", "client"), getClientRoles);
router.post("/:id/roles", authorize("admin", "client"), validate(createCustomRoleSchema), createCustomRole);
router.put("/:id/roles/:roleId", authorize("admin", "client"), validate(updateCustomRoleSchema), updateCustomRole);
router.delete("/:id/roles/:roleId", authorize("admin", "client"), deleteCustomRole);

// ─── Sub-Users per Client ─────────────────────────────────────────────────────
router.get("/:id/users", authorize("admin", "staff", "client"), getClientSubUsers);
router.get("/:id/users/:subUserId", authorize("admin", "staff", "client"), getClientSubUserById);
router.post("/:id/users", authorize("admin", "client"), validate(createSubUserSchema), createClientSubUser);
router.put("/:id/users/:subUserId", authorize("admin", "client"), validate(updateSubUserSchema), updateClientSubUser);
router.delete("/:id/users/:subUserId", authorize("admin", "client"), deleteClientSubUser);

import { 
  getClientPriceList, 
  setClientPriceList, 
  removeClientPriceList, 
  setClientSingleItemPrice,
  bulkUpsertClientItems,
  bulkDeleteClientItems
} from "../controllers/priceList.controller";
import { assignPriceListSchema } from "../validation/priceList.validation";

/**
 * @swagger
 * /api/clients/{id}/price-list:
 *   get:
 *     summary: Obtener la lista de precios personalizados del cliente
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     responses:
 *       '200':
 *         description: Retorna la lista de precios y sus ítems, o null si no tiene.
 *         
 *   put:
 *     summary: Sincronizar (Reemplazar) TODOS los precios especiales del cliente
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     description: |
 *       **Mecanismo de Reemplazo Total.** Este endpoint toma el arreglo de ítems enviado y reemplaza cualquier configuración anterior que tuviera el cliente. Si el cliente no tenía una lista, la crea automáticamente.
 *       
 *       **¿Cuándo utilizarlo?**
 *       Utiliza este endpoint cuando tu Frontend maneje el estado de TODOS los ítems al mismo tiempo y envíe la lista completa al backend.
 *       
 *       **Casos de uso:**
 *       * Un formulario gigante donde el usuario edita múltiples precios a la vez y hace clic en un botón global de "Guardar Cambios".
 *       * Sincronización masiva de datos (ej. importar precios desde un excel en el frontend y guardarlos de golpe).
 *       * Si el cliente tenía 9 ítems y quieres que tenga 10, DEBES enviar el arreglo con los 10 ítems.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_id:
 *                       type: string
 *                       format: uuid
 *                     price:
 *                       type: number
 *                       example: 12.50
 *     responses:
 *       '200':
 *         description: Precios sincronizados exitosamente.
 *
 *   delete:
 *     summary: Eliminar completamente los precios personalizados del cliente
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: El cliente vuelve a usar los precios estándar del catálogo base para todos los servicios.
 */
router.get("/:id/price-list", authorize("admin", "staff", "client"), getClientPriceList);
router.put("/:id/price-list", authorize("admin"), validate(assignPriceListSchema), setClientPriceList);
router.delete("/:id/price-list", authorize("admin"), removeClientPriceList);

/**
 * @swagger
 * /api/clients/{id}/price-list/items/{itemId}:
 *   post:
 *     summary: Agregar o actualizar un ÚNICO ítem personalizado
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     description: |
 *       **Actualización Granular.** Este endpoint actualiza o inserta un único ítem en la lista personalizada del cliente, dejando el resto de sus ítems completamente intactos.
 *       
 *       **¿Cuándo utilizarlo?**
 *       Utilízalo cuando quieras modificar o añadir una sola regla de precio sin tener que cargar ni enviar el resto de los ítems del cliente.
 *       
 *       **Casos de uso:**
 *       * **Añadir:** El cliente ya tiene 9 precios especiales y quieres añadir un 10º ítem. Simplemente envías un POST a este endpoint con el ID del nuevo ítem y el sistema lo añade, conservando los otros 9.
 *       * **Edición Inline:** Tienes una tabla en el frontend y el usuario edita el precio de una sola celda. Al salir del foco de la celda (onBlur), disparas este endpoint para actualizar solo ese registro.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del servicio/ítem del catálogo general
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - price
 *             properties:
 *               price:
 *                 type: number
 *                 example: 20.00
 *     responses:
 *       '200':
 *         description: Ítem añadido o actualizado correctamente.
 *       '404':
 *         description: El itemId proporcionado no existe en el catálogo general (previene creación implícita).
 */
router.post("/:id/price-list/items/:itemId", authorize("admin"), setClientSingleItemPrice);

/**
 * @swagger
 * /api/clients/{id}/price-list/items:
 *   post:
 *     summary: Agregar o actualizar MÚLTIPLES ítems personalizados (Upsert masivo)
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     description: |
 *       **Upsert Granular Masivo.** Este endpoint actualiza o inserta varios ítems en la lista personalizada del cliente, dejando el resto de sus ítems (los que no envíes aquí) completamente intactos.
 *       
 *       **¿Cuándo utilizarlo?**
 *       Utilízalo cuando quieras modificar o añadir una lista de reglas de precio sin eliminar las que ya existían previamente.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_id:
 *                       type: string
 *                       format: uuid
 *                     price:
 *                       type: number
 *     responses:
 *       '200':
 *         description: Ítems añadidos o actualizados correctamente.
 *   patch:
 *     summary: Actualizar precios de MÚLTIPLES ítems personalizados
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     description: Alias del POST. Actualiza los ítems especificados dejando el resto intactos.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_id:
 *                       type: string
 *                       format: uuid
 *                     price:
 *                       type: number
 *     responses:
 *       '200':
 *         description: Ítems actualizados correctamente.
 *   delete:
 *     summary: Eliminar MÚLTIPLES ítems específicos de la lista del cliente
 *     tags: [Listas de Precios de Clientes]
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     description: |
 *       Elimina una lista de ítems de la configuración de precios del cliente. Esos servicios volverán a usar el precio base del catálogo general.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - item_ids
 *             properties:
 *               item_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       '200':
 *         description: Ítems eliminados de la lista personalizada correctamente.
 */
router.post("/:id/price-list/items", authorize("admin"), bulkUpsertClientItems);
router.patch("/:id/price-list/items", authorize("admin"), bulkUpsertClientItems);
router.delete("/:id/price-list/items", authorize("admin"), bulkDeleteClientItems);

export default router;
