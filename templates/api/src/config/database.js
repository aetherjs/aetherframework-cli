import mysql from 'mysql2/promise';
import logger from "../utils/logger.js";
let pool = null;

export async function initDatabase() {
  const isDbEnabled = process.env.DB_ENABLED === 'true';
  
  if (!isDbEnabled) {
    logger.info('Database is disabled (DB_ENABLED=false or not set). Skipping.');
    return;
  }

  logger.info('Connecting to MySQL database...');
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'aether_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
  });

  const connection = await pool.getConnection();
  try {
    await connection.ping();
    logger.info('MySQL Database connected successfully!');
  } finally {
    connection.release();
  }
}

export async function closeDatabase() {
  const isDbEnabled = process.env.DB_ENABLED === 'true';
  if (pool && isDbEnabled) {
    await pool.end();
    logger.info('MySQL Database connections closed.');
  }
}

export function getPool() {
  const isDbEnabled = process.env.DB_ENABLED === 'true';
  if (!isDbEnabled || !pool) {
    throw new Error('Database is disabled or not initialized. Check DB_ENABLED in .env');
  }
  return pool;
}
