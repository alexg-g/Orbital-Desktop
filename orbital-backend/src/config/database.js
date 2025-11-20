// Load environment variables (.env.test for tests, .env.local for dev, .env as fallback)
const fs = require('fs');
const path = require('path');
const backendEnvTestPath = path.join(__dirname, '../../.env.test');
const backendEnvLocalPath = path.join(__dirname, '../../.env.local');
const backendEnvPath = path.join(__dirname, '../../.env');

// Debug: Log DATABASE_URL before loading env files
console.log('[DB CONFIG DEBUG] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB CONFIG DEBUG] DATABASE_URL before dotenv:', process.env.DATABASE_URL);

// For tests, always use .env.test (highest priority)
if (process.env.NODE_ENV === 'test' && fs.existsSync(backendEnvTestPath)) {
  console.log('[DB CONFIG DEBUG] Loading .env.test for test environment');
  delete process.env.DATABASE_URL;
  require('dotenv').config({ path: backendEnvTestPath, override: true });
  console.log('[DB CONFIG DEBUG] DATABASE_URL after loading .env.test:', process.env.DATABASE_URL);
} else if (fs.existsSync(backendEnvLocalPath)) {
  console.log('[DB CONFIG DEBUG] Loading .env.local with override: true');
  // Explicitly unset DATABASE_URL to prevent shell environment conflicts
  delete process.env.DATABASE_URL;
  require('dotenv').config({ path: backendEnvLocalPath, override: true });
  console.log('[DB CONFIG DEBUG] DATABASE_URL after loading .env.local:', process.env.DATABASE_URL);
} else {
  console.log('[DB CONFIG DEBUG] Loading .env (fallback)');
  require('dotenv').config({ path: backendEnvPath });
  console.log('[DB CONFIG DEBUG] DATABASE_URL after loading .env:', process.env.DATABASE_URL);
}

const { Pool } = require('pg');
const logger = require('../utils/logger');

/**
 * PostgreSQL Database Configuration
 *
 * Uses connection pooling for efficient database access.
 * Connects to Signal messages, threads, groups, and media tables.
 */

// Debug: Log if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('WARNING: DATABASE_URL is not set! Tests will fail.');
  console.error('Current working directory:', process.cwd());
  console.error('NODE_ENV:', process.env.NODE_ENV);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  min: 2,                         // Minimum connections in pool
  max: 10,                        // Maximum connections in pool
  idleTimeoutMillis: 30000,       // Close idle connections after 30s
  connectionTimeoutMillis: 2000,  // Fail fast if connection unavailable
  // SSL configuration (disable for localhost, enable for remote databases)
  // Localhost connections don't need SSL (self-signed certificate error)
  ssl: false
});

// Log successful connection
pool.on('connect', (client) => {
  logger.info('New database client connected');
});

// Log connection errors
pool.on('error', (err, client) => {
  logger.error('Unexpected database error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a parameterized query
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Parameters to substitute
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Executed query', {
      text: text.substring(0, 100), // Log first 100 chars
      duration: `${duration}ms`,
      rows: result.rowCount
    });

    return result;
  } catch (error) {
    logger.error('Database query error', {
      text: text.substring(0, 100),
      error: error.message
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transaction handling
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  const client = await pool.connect();

  // Add query method to client
  const originalQuery = client.query.bind(client);
  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery(...args);
  };

  // Add release method with error handling
  const originalRelease = client.release.bind(client);
  client.release = () => {
    client.query = originalQuery;
    return originalRelease();
  };

  return client;
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    logger.info('Database connection test successful', {
      timestamp: result.rows[0].now
    });
    return true;
  } catch (error) {
    logger.error('Database connection test failed', error);
    throw error;
  }
}

/**
 * Gracefully close all connections
 */
async function closePool() {
  logger.info('Closing database connection pool...');
  await pool.end();
  logger.info('Database connection pool closed');
}

module.exports = {
  query,
  getClient,
  testConnection,
  closePool,
  pool
};
