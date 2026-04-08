import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { UserService } from "../services/user.service";
import { UserRepository } from "../repositories/user.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { setAuthCookies, clearAuthCookies } from "../utils/auth.helper";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import {
  getAccessTokenCookieOptions,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/jwt";

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and User Profile Management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Crear usuario (admin, staff, driver o client)
 *     description: |
 *       - **client** (por defecto si no envías `role`): público. Crea `users` + `client_profiles` (+ `properties` opcional). Set-Cookie `accessToken` y `refreshToken` para el nuevo usuario.
 *       - **admin** / **staff** / **driver**: requiere cookie de sesión de un **admin**. Crea el usuario; **no** inicia sesión al creado (el admin mantiene su sesión).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuario creado (client incluye client_profile; cookies solo si role client)
 *       400:
 *         description: Validación fallida
 *       401:
 *         description: admin/staff/driver sin autenticación
 *       403:
 *         description: No es admin
 *       409:
 *         description: Email, teléfono o NIF duplicado
 */
export const register = async (req: Request, res: Response) => {
  try {
    let issueSession = true;

    if ((req.body?.role ?? "client") === "client") {
      const accessToken = req.cookies?.accessToken as string | undefined;
      if (accessToken) {
        try {
          const actor = verifyAccessToken(accessToken);
          if (actor.role === "admin") {
            issueSession = false;
          }
        } catch {
          issueSession = true;
        }
      }
    }

    const { user, tokens } = await AuthService.register(req.body, { issueSession });
    if (tokens) setAuthCookies(res, tokens);

    const baseUser = {
      id: user.id!.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      language: user.language,
    };

    if (user.role === "client") {
      const client_profile = await ClientProfileRepository.findByUserId(user.id!);
      return sendSuccess(res, 201, "Registration successful", {
        user: baseUser,
        client_profile,
      });
    }

    return sendSuccess(res, 201, "User created", { user: baseUser });
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    const dup = duplicateEntryMessage(error);
    if (dup) return sendError(res, 409, dup);
    if (error.code === "ER_DUP_ENTRY") return sendError(res, 409, "Duplicate entry");
    return sendError(res, 400, "Registration failed");
  }
};

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión (cookies httpOnly)
 *     description: Respuesta incluye Set-Cookie para `accessToken` y `refreshToken`. Usar credenciales incluidas en peticiones siguientes (same-origin / CORS credentials).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login OK
 *       401:
 *         description: Credenciales inválidas
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { user, tokens } = await AuthService.login(email, password);
    setAuthCookies(res, tokens);

    return sendSuccess(res, 200, "Login successful", {
      user: {
        id: user.id!.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 401, "Invalid credentials");
  }
};

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar access token
 *     description: Requiere cookie `refreshToken`. Actualiza cookie `accessToken`.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Nuevo access token en cookie
 *       401:
 *         description: Falta o es inválido el refresh token
 */
export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError("Refresh token missing", 401);

    const { user, accessToken } = await AuthService.refreshAccessToken(token);
    res.cookie("accessToken", accessToken, getAccessTokenCookieOptions());

    return sendSuccess(res, 200, "Token refreshed", {
      user: {
        id: user.id!.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 401, "Could not refresh access token");
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Perfil del usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Usuario actual (sin password)
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
export const getMe = async (req: Request, res: Response) => {
  try {
    const { user, client_profile, properties } = await UserService.getUserByIdWithClientProfileIfExists(req.user!.userId);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, refresh_token, ...safeUser } = user;
    
    return sendSuccess(res, 200, "Current user", { 
      user: safeUser,
      client_profile,
      properties
    });
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch user");
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   patch:
 *     summary: Actualizar mi perfil
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               language:
 *                 type: string
 *                 enum: [en, es]
 *     responses:
 *       200:
 *         description: Perfil actualizado
 *       400:
 *         description: Error de validación o actualización
 */
export const updateMe = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user!.userId);
    await AuthService.updateMe(userId, req.body);
    
    const { user, client_profile, properties } = await UserService.getUserByIdWithClientProfileIfExists(userId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, refresh_token, ...safeUser } = user;

    return sendSuccess(res, 200, "Profile updated", { 
      user: safeUser,
      client_profile,
      properties
    });
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Profile update failed");
  }
};

/**
 * @swagger
 * /api/auth/password:
 *   patch:
 *     summary: Cambiar contraseña (usuario autenticado)
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       400:
 *         description: Validación o contraseña actual incorrecta
 */
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    await AuthService.changePassword(Number(req.user!.userId), current_password, new_password);
    return sendSuccess(res, 200, "Password changed successfully");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Password change failed");
  }
};

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicitar enlace de recuperación (forgot password)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset link sent
 *       500:
 *         description: Request failed
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const resetUrl = await AuthService.requestPasswordReset(email);
    
    return sendSuccess(res, 200, "If that email exists, a reset link has been sent", {
      reset_url: resetUrl,
    });
  } catch (error: any) {
    return sendError(res, 500, "Password reset request failed");
  }
};

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Restablecer contraseña con token
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid token or reset failed
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (typeof token !== "string") {
      throw new AppError("Invalid or missing reset token", 400);
    }
    const { password } = req.body;
    await AuthService.resetPassword(token, password);
    
    return sendSuccess(res, 200, "Password has been reset. You can now log in.");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Password reset failed");
  }
};

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión (invalida refresh en BD y borra cookies)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Sesión cerrada
 *       400:
 *         description: Error al cerrar sesión
 */
export const logout = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      const decoded = verifyRefreshToken(token);
      if (decoded?.userId) {
        await AuthService.logout(Number(decoded.userId));
      }
    }

    clearAuthCookies(res);
    return sendSuccess(res, 200, "Logged out");
  } catch (error: any) {
    return sendError(res, 400, "Logout failed");
  }
};
