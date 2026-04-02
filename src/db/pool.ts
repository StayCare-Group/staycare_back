import mysql from 'mysql2/promise';
import { config } from '../config/index';

const poolOptions: mysql.PoolOptions = {
  host:               config.db.host,
  port:               config.db.port,
  user:               config.db.user,
  password:           config.db.password,
  database:           config.db.database,
  connectionLimit:    config.db.connectionLimit,
  waitForConnections: true,
  enableKeepAlive:    true,
  timezone:           'Z',            // fuerza UTC en todas las queries
  multipleStatements: false,          // prevención extra contra SQL injection
};

// Forzamos SSL si el host es externo (no localhost)
const isLocal = config.db.host === 'localhost' || config.db.host === '127.0.0.1';

if (!isLocal) {
  console.log(`[DB] Aplicando configuración SSL para host externo: ${config.db.host}`);
  poolOptions.ssl = { rejectUnauthorized: false };
} else {
  console.log(`[DB] Conectando sin SSL a host local: ${config.db.host}`);
}

const pool = mysql.createPool(poolOptions);

export default pool;