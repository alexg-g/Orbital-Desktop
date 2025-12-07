#!/usr/bin/env node

/**
 * Test Database Setup Script
 *
 * This script sets up the test database using native PostgreSQL by:
 * 1. Verifying PostgreSQL is running
 * 2. Creating the test database and user if they don't exist
 * 3. Running migrations on the test database
 *
 * Prerequisites:
 *   - PostgreSQL installed via Homebrew (brew install postgresql@16)
 *   - PostgreSQL service running (brew services start postgresql@16)
 *
 * Usage:
 *   node scripts/setup-test-db.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_DB_NAME = 'orbital_test';
const TEST_DB_USER = 'orbital_test_user';
const TEST_DB_PASSWORD = 'orbital_test_password';
const TEST_DB_PORT = 5433;

console.log('==================================================');
console.log('Orbital Test Database Setup (Native PostgreSQL)');
console.log('==================================================\n');

try {
  // Step 1: Check if PostgreSQL is running
  console.log('Step 1: Checking PostgreSQL status...');
  try {
    execSync('pg_isready', { stdio: 'ignore' });
    console.log('  [OK] PostgreSQL is running\n');
  } catch (e) {
    console.log('  [WARN] PostgreSQL may not be running.');
    console.log('  Attempting to start PostgreSQL...');
    try {
      execSync('brew services start postgresql@16', { stdio: 'inherit' });
      execSync('sleep 3');
      console.log('  [OK] PostgreSQL started\n');
    } catch (startErr) {
      throw new Error('PostgreSQL is not running. Please start it with: brew services start postgresql@16');
    }
  }

  // Step 2: Create test user if it doesn't exist
  console.log('Step 2: Setting up test user...');
  try {
    // Check if user exists
    const userCheck = execSync(`psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${TEST_DB_USER}'"`, { encoding: 'utf-8' });
    if (userCheck.trim() === '1') {
      console.log(`  [OK] User '${TEST_DB_USER}' already exists\n`);
    }
  } catch (e) {
    // User doesn't exist, create it
    console.log(`  Creating user '${TEST_DB_USER}'...`);
    try {
      execSync(`psql -c "CREATE USER ${TEST_DB_USER} WITH PASSWORD '${TEST_DB_PASSWORD}' CREATEDB;"`, { stdio: 'inherit' });
      console.log(`  [OK] User '${TEST_DB_USER}' created\n`);
    } catch (createErr) {
      console.log(`  [WARN] Could not create user (may already exist)\n`);
    }
  }

  // Step 3: Create test database if it doesn't exist
  console.log('Step 3: Setting up test database...');
  try {
    const dbCheck = execSync(`psql -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'"`, { encoding: 'utf-8' });
    if (dbCheck.trim() === '1') {
      console.log(`  [OK] Database '${TEST_DB_NAME}' already exists\n`);
    }
  } catch (e) {
    // Database doesn't exist, create it
    console.log(`  Creating database '${TEST_DB_NAME}'...`);
    try {
      execSync(`psql -c "CREATE DATABASE ${TEST_DB_NAME} OWNER ${TEST_DB_USER};"`, { stdio: 'inherit' });
      console.log(`  [OK] Database '${TEST_DB_NAME}' created\n`);
    } catch (createErr) {
      console.log(`  [WARN] Could not create database (may already exist)\n`);
    }
  }

  // Step 4: Grant privileges
  console.log('Step 4: Granting privileges...');
  try {
    execSync(`psql -d ${TEST_DB_NAME} -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${TEST_DB_USER};"`, { stdio: 'ignore' });
    execSync(`psql -d ${TEST_DB_NAME} -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${TEST_DB_USER};"`, { stdio: 'ignore' });
    console.log(`  [OK] Privileges granted\n`);
  } catch (e) {
    console.log(`  [WARN] Could not grant privileges (tables may not exist yet)\n`);
  }

  // Step 5: Run migrations
  console.log('Step 5: Running migrations on test database...');
  const migrationsDir = path.join(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('  [WARN] No migrations directory found. Skipping migration step.\n');
  } else {
    const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
    console.log(`  Found ${migrations.length} migration files`);

    try {
      const env = Object.assign({}, process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5432/${TEST_DB_NAME}`
      });

      execSync('npm run migrate', {
        cwd: path.dirname(__dirname),
        stdio: 'inherit',
        env: env
      });
      console.log('  [OK] Migrations completed\n');
    } catch (e) {
      console.log('  [WARN] Migration command failed. You may need to run manually:');
      console.log(`       DATABASE_URL="postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5432/${TEST_DB_NAME}" npm run migrate\n`);
    }
  }

  // Step 6: Verify connection
  console.log('Step 6: Verifying test database connection...');
  const testConnection = `
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: 'postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:5432/${TEST_DB_NAME}'
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
    console.log('You can now run tests with:');
    console.log('  npm test\n');
    console.log('Or run integration tests only:');
    console.log('  npm run test:integration\n');
    process.exit(0);
  } catch (e) {
    throw new Error('Failed to verify test database connection');
  }

} catch (error) {
  console.error('\n[ERROR]', error.message);
  console.error('\nTroubleshooting tips:');
  console.error('1. Ensure PostgreSQL is installed: brew install postgresql@16');
  console.error('2. Start PostgreSQL: brew services start postgresql@16');
  console.error('3. Check PostgreSQL status: pg_isready');
  console.error('4. Verify port 5432 is in use: lsof -i :5432\n');
  process.exit(1);
}
