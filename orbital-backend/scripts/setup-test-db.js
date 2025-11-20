#!/usr/bin/env node

/**
 * Test Database Setup Script
 *
 * This script sets up the test database by:
 * 1. Ensuring the test PostgreSQL container is running
 * 2. Running migrations on the test database
 * 3. Preparing the test database for integration tests
 *
 * Usage:
 *   node scripts/setup-test-db.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOCKER_COMPOSE_FILE = path.join(__dirname, '../docker-compose.yml');
const TEST_DB_CONTAINER = 'orbital-postgres-test';
const TEST_DB_NAME = 'orbital_test';
const TEST_DB_USER = 'orbital_test_user';
const TEST_DB_PASSWORD = 'orbital_test_password';

console.log('==================================================');
console.log('Orbital Test Database Setup');
console.log('==================================================\n');

try {
  // Step 1: Start test database container
  console.log('Step 1: Starting test database container...');
  try {
    // Check if container is already running
    execSync(`docker ps | grep ${TEST_DB_CONTAINER}`, { stdio: 'ignore' });
    console.log(`  [OK] Container ${TEST_DB_CONTAINER} is already running\n`);
  } catch (e) {
    // Container not running, start it
    console.log(`  Starting ${TEST_DB_CONTAINER} from docker-compose...`);
    execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d postgres-test`, { stdio: 'inherit' });
    console.log(`  [OK] Container started\n`);

    // Wait for database to be ready
    console.log('  Waiting for database to be ready...');
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 30) {
      try {
        execSync(
          `docker exec ${TEST_DB_CONTAINER} pg_isready -U ${TEST_DB_USER} -d ${TEST_DB_NAME}`,
          { stdio: 'ignore' }
        );
        ready = true;
      } catch (e) {
        attempts++;
        console.log(`  Attempt ${attempts}/30 - waiting...`);
        execSync('sleep 1');
      }
    }

    if (!ready) {
      throw new Error('Test database failed to start after 30 seconds');
    }
    console.log('  [OK] Database is ready\n');
  }

  // Step 2: Check if migrations have been run
  console.log('Step 2: Checking if migrations exist...');
  const migrationsDir = path.join(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('  [WARN] No migrations directory found. Skipping migration step.');
    console.log('  [WARN] Please run migrations manually before running tests.\n');
  } else {
    const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
    console.log(`  [OK] Found ${migrations.length} migration files\n`);

    // Step 3: Run migrations (using node-pg-migrate or similar)
    console.log('Step 3: Running migrations on test database...');
    try {
      const env = Object.assign({}, process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5433/${TEST_DB_NAME}`
      });

      // Try to run migrations using node-pg-migrate if available
      try {
        execSync('npm run migrate', {
          cwd: path.dirname(__dirname),
          stdio: 'inherit',
          env: env
        });
        console.log('  [OK] Migrations completed\n');
      } catch (e) {
        console.log('  [WARN] Migration command failed or not available');
        console.log('  [WARN] If migrations are required, please run them manually:\n');
        console.log(`       DATABASE_URL="postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5433/${TEST_DB_NAME}" npm run migrate\n`);
      }
    } catch (e) {
      console.log('  [WARN] Could not run migrations automatically');
      console.log('  [WARN] Please ensure migrations are run before testing.\n');
    }
  }

  // Step 4: Verify connection
  console.log('Step 4: Verifying test database connection...');
  const testConnection = `
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: 'postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5433/${TEST_DB_NAME}'
    });
    pool.query('SELECT NOW()', async (err, res) => {
      if (err) {
        console.log('  [ERROR] Connection failed:', err.message);
        process.exit(1);
      } else {
        console.log('  [OK] Successfully connected to test database');
        console.log('  [OK] Current time:', res.rows[0].now);
        await pool.end();
        process.exit(0);
      }
    });
  `;

  try {
    execSync(`node -e "${testConnection}"`, { stdio: 'inherit' });
    console.log('\n==================================================');
    console.log('Test Database Setup Complete!');
    console.log('==================================================\n');
    console.log('You can now run integration tests with:');
    console.log('  npm test tests/quota.test.js\n');
    process.exit(0);
  } catch (e) {
    throw new Error('Failed to verify test database connection');
  }

} catch (error) {
  console.error('\n[ERROR]', error.message);
  console.error('\nTroubleshooting tips:');
  console.error('1. Ensure Docker is running');
  console.error('2. Check Docker logs: docker logs orbital-postgres-test');
  console.error('3. Verify PostgreSQL is installed: docker --version');
  console.error('4. Check if port 5433 is available: lsof -i :5433\n');
  process.exit(1);
}
