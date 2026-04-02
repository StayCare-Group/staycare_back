// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

const required = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'];
const missing  = required.filter(k => !process.env[k]);

if (missing.length) {
  console.error(`[FATAL] Variables de entorno faltantes: ${missing.join(', ')}`);
  process.exit(1);
}

export const config = {
  db: {
    host:            process.env.DB_HOST!,
    port:            Number(process.env.DB_PORT) || 3306,
    user:            process.env.DB_USER!,
    password:        process.env.DB_PASSWORD!,
    database:        process.env.DB_NAME!,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  },
  app: {
    port:      Number(process.env.PORT) || 5000,
    env:       process.env.NODE_ENV || 'development',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  },
  jwt: {
    accessSecret:  process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
  },
  smtp: {
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user:   process.env.SMTP_USER,
    pass:   process.env.SMTP_PASS,
    from:   process.env.SMTP_FROM,
  },
} as const;