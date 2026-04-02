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

// En producción (Render/Aiven), la base de datos externa requiere SSL.
if (config.app.env !== 'development') {
  poolOptions.ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool(poolOptions);

export default pool;