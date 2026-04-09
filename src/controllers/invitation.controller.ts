import type { Request, Response } from "express";
import { InvitationService } from "../services/invitation.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

/**
 * @swagger
 * tags:
 *   name: Invitations
 *   description: Gestión de invitaciones para alta de personal (admin, staff, driver)
 */

/**
 * @swagger
 * /api/invitations:
 *   post:
 *     summary: Crear y enviar una invitación
 *     description: |
 *       Solo **admin**. Genera un token único de 64 hex chars, invalida invitaciones previas
 *       pendientes para el mismo email y envía el link de registro por correo.
 *       Si el envío falla, devuelve el `invite_url` para que el admin lo comparta manualmente.
 *     tags: [Invitations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: conductor@empresa.com
 *               role:
 *                 type: string
 *                 enum: [admin, staff, driver]
 *                 example: driver
 *     responses:
 *       201:
 *         description: Invitación creada (email enviado o link manual)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     invitation:
 *                       type: object
 *                       properties:
 *                         id:       { type: integer }
 *                         email:    { type: string }
 *                         role:     { type: string }
 *                         expires_at: { type: string, format: date-time }
 *                         invite_url:
 *                           type: string
 *                           description: Solo presente si el email falló
 *       400:
 *         description: Error al crear invitación
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No es admin
 *       409:
 *         description: El email ya tiene un usuario registrado
 */
export const createInvitation = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    const createdByUserId = req.user!.userId;

    const result = await InvitationService.createInvitation(email, role, createdByUserId);

    const message = result.emailSent
      ? "Invitation sent"
      : "Invitation created but email failed to send. Share the link manually.";

    return sendSuccess(res, 201, message, { invitation: result.invitation });
  } catch (error: any) {
    const status = error.statusCode ?? error.status ?? 400;
    return sendError(res, status, error.message || "Failed to create invitation");
  }
};

/**
 * @swagger
 * /api/invitations/{token}/validate:
 *   get:
 *     summary: Validar si un token de invitación es válido
 *     description: Endpoint público. El frontend lo llama antes de mostrar el form de registro.
 *     tags: [Invitations]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token hex de 64 chars
 *     responses:
 *       200:
 *         description: Token válido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     invitation:
 *                       type: object
 *                       properties:
 *                         email:      { type: string }
 *                         role:       { type: string }
 *                         expires_at: { type: string, format: date-time }
 *       404:
 *         description: Token no encontrado o ya usado
 *       410:
 *         description: Token expirado
 */
export const validateInvitation = async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const data = await InvitationService.validateInvitation(token);
    return sendSuccess(res, 200, "Invitation is valid", { invitation: data });
  } catch (error: any) {
    const status = error.statusCode ?? error.status ?? 400;
    return sendError(res, status, error.message || "Failed to validate invitation");
  }
};

/**
 * @swagger
 * /api/invitations/{token}/register:
 *   post:
 *     summary: Completar registro mediante invitación
 *     description: |
 *       Endpoint público. Crea el usuario con el rol definido en la invitación,
 *       marca el token como usado e inicia sesión automáticamente
 *       (Set-Cookie `accessToken` + `refreshToken`).
 *     tags: [Invitations]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token de invitación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, password]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: Juan Pérez
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: secreto123
 *               phone:
 *                 type: string
 *                 example: "+34600000000"
 *               language:
 *                 type: string
 *                 enum: [en, es]
 *                 default: es
 *     responses:
 *       201:
 *         description: Cuenta creada. Cookies de sesión incluidas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:       { type: integer }
 *                         name:     { type: string }
 *                         email:    { type: string }
 *                         role:     { type: string }
 *                         language: { type: string }
 *       400:
 *         description: Error de validación o registro
 *       404:
 *         description: Token no encontrado o ya usado
 *       409:
 *         description: Email ya registrado
 *       410:
 *         description: Token expirado
 */
export const registerViaInvitation = async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { name, password, phone, language } = req.body;

    const result = await InvitationService.registerViaInvitation(token, {
      name,
      password,
      phone,
      language,
    });

    res
      .cookie("accessToken", result.tokens.accessToken, result.cookieOptions.access)
      .cookie("refreshToken", result.tokens.refreshToken, result.cookieOptions.refresh);

    return sendSuccess(res, 201, "Account created successfully", { user: result.user });
  } catch (error: any) {
    const status = error.statusCode ?? error.status ?? 400;
    return sendError(res, status, error.message || "Registration failed");
  }
};

/**
 * @swagger
 * /api/invitations:
 *   get:
 *     summary: Listar invitaciones con filtros y paginación
 *     description: Solo **admin**. Permite filtrar por estado (pendiente, expirada, usada) y buscar por email.
 *     tags: [Invitations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, expired, used] }
 *         description: Filtrar por estado de la invitación
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por email
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de invitaciones con paginación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invitations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:           { type: integer }
 *                           token:        { type: string }
 *                           email:        { type: string }
 *                           role:         { type: string }
 *                           used:         { type: boolean }
 *                           used_at:      { type: string, format: date-time, nullable: true }
 *                           expires_at:   { type: string, format: date-time }
 *                           created_at:   { type: string, format: date-time }
 *                           creator_name: { type: string }
 *                           creator_email: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No es admin
 */
export const listInvitations = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as any;
    const search = req.query.search as string | undefined;
    const { page, limit, skip } = parsePagination(req);

    const { invitations, total } = await InvitationService.listInvitations(limit, skip, { status, search });
    
    return sendSuccess(
      res, 
      200, 
      "Invitations list", 
      { invitations },
      paginationMeta(total, page, limit)
    );
  } catch (error: any) {
    return sendError(res, 400, "Failed to fetch invitations");
  }
};
