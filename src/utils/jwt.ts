import jwt from "jsonwebtoken";
import { CookieOptions } from "express";

export type UserRole = "admin" | "client" | "driver" | "staff";

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  userId: string;
}

const accessTokenSecret = process.env.JWT_ACCESS_SECRET as string;
const refreshTokenSecret = process.env.JWT_REFRESH_SECRET as string;

// jsonwebtoken `expiresIn` expects seconds, not milliseconds.
const accessTokenExpiresIn: number = process.env.ACCESS_TOKEN_EXPIRES
  ? parseInt(process.env.ACCESS_TOKEN_EXPIRES, 10)
  : 15 * 60; // 15 minutes

const refreshTokenExpiresIn: number = process.env.REFRESH_TOKEN_EXPIRES
  ? parseInt(process.env.REFRESH_TOKEN_EXPIRES, 10)
  : 7 * 24 * 60 * 60; // 7 days

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

if (!accessTokenSecret || !refreshTokenSecret) {
  // In production, these should always be set.
  console.warn("JWT secrets are not fully configured. Check your .env file.");
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, accessTokenSecret, {
    expiresIn: accessTokenExpiresIn,
  });
};

export const signRefreshToken = (payload: RefreshTokenPayload): string => {
  return jwt.sign(payload, refreshTokenSecret, {
    expiresIn: refreshTokenExpiresIn,
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, accessTokenSecret) as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, refreshTokenSecret) as RefreshTokenPayload;
};

// Cross-origin (e.g. Vercel frontend + Render backend) requires sameSite: "none" and secure: true
const isProduction = process.env.NODE_ENV === "production";
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
};

export const getAccessTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: FIFTEEN_MINUTES_MS,
});

export const getRefreshTokenCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: SEVEN_DAYS_MS,
});

export const getClearCookieOptions = (): CookieOptions => ({
  ...baseCookieOptions,
  maxAge: 0,
});

