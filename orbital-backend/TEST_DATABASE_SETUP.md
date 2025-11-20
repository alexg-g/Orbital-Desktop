# Integration Test Database Setup Guide

This guide explains how to set up and run the integration test database for Orbital Backend tests.

## Overview

The integration test suite requires a separate, isolated PostgreSQL database to avoid conflicts with development and production databases. This is critical for:

- Isolation: Tests don't affect production or development data
- Consistency: Fresh database state for each test run
- Reliability: Predictable test results
- Safety: Can run tests freely without data loss concerns

## Architecture

```
┌─────────────────────┐
│  docker-compose.yml │
└─────────────────────┘
         │
         ├─→ postgres (port 5432)      - Development database
         │   Container: orbital-postgres-dev
         │   Database: orbital
         │
         └─→ postgres-test (port 5433) - Test database
             Container: orbital-postgres-test
             Database: orbital_test
```

## Environment Files

- `.env.local` - Development environment (loaded by default)
- `.env.test` - Test environment (loaded when NODE_ENV=test)
- `.env` - Fallback environment

## Quick Start

### 1. Initial Setup

Run the setup script once to prepare the test database:

```bash
cd orbital-backend
npm run test:setup
```

This script:
- Starts the test PostgreSQL container (port 5433)
- Waits for the database to be ready
- Runs migrations on the test database
- Verifies the connection

### 2. Run Integration Tests

After setup, run the integration tests:

```bash
# Run all integration tests
npm run test:integration

# Run all tests with coverage
npm test

# Run tests in watch mode (useful for development)
npm run test:watch

# Run specific test file
NODE_ENV=test jest tests/quota.test.js

# Run with verbose output
NODE_ENV=test jest tests/quota.test.js --verbose
```

### 3. Clean Up

To stop the test database (without deleting data):

```bash
docker-compose stop postgres-test
```

To remove the test database and start fresh:

```bash
docker-compose down postgres-test
docker volume rm orbital-desktop_postgres_test_data
npm run test:setup  # Recreate from scratch
```

## Configuration Files

### docker-compose.yml

Added a new service `postgres-test`:

```yaml
postgres-test:
  image: postgres:15-alpine
  container_name: orbital-postgres-test
  environment:
    POSTGRES_USER: orbital_test_user
    POSTGRES_PASSWORD: orbital_test_password
    POSTGRES_DB: orbital_test
  ports:
    - "5433:5432"
  volumes:
    - postgres_test_data:/var/lib/postgresql/data
```

**Key Points:**
- Uses separate port 5433 (production uses 5432)
- Isolated volume `postgres_test_data`
- Same PostgreSQL version (15-alpine) as production

### .env.test

Created new file `/orbital-backend/.env.test`:

```env
NODE_ENV=test
DATABASE_URL=postgresql://orbital_test_user:orbital_test_password@localhost:5433/orbital_test
```

This file is:
- Loaded automatically when NODE_ENV=test
- Overrides `.env.local` for test runs
- Never checked into production environments

### jest.setup.js

Updated to explicitly load `.env.test` for test environment:

```javascript
// Explicitly load .env.test with override to ensure test database is used
if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: '.env.test', override: true });
}
```

### jest.config.js

Added configuration to set NODE_ENV=test for all tests:

```javascript
testEnvironmentOptions: {
  NODE_ENV: 'test'
}
```

### src/config/database.js

Updated to prioritize .env.test when NODE_ENV=test:

```javascript
if (process.env.NODE_ENV === 'test' && fs.existsSync(backendEnvTestPath)) {
  // Load .env.test for test environment
  require('dotenv').config({ path: backendEnvTestPath, override: true });
}
```

## How It Works

1. **Jest starts with NODE_ENV=test**
   - Jest configuration sets NODE_ENV=test

2. **jest.setup.js loads .env.test**
   - Loads database credentials for test database
   - Sets NODE_ENV explicitly to 'test'

3. **database.js respects NODE_ENV**
   - Checks if NODE_ENV=test
   - If true, uses .env.test credentials
   - Connects to localhost:5433 instead of 5432

4. **Tests run against isolated database**
   - Test database on port 5433
   - Data is isolated from development
   - Each test run starts with clean state

## Troubleshooting

### Error: "Connection refused on 5433"

The test database container isn't running.

**Solution:**
```bash
# Start just the test database
docker-compose up -d postgres-test

# Or run the full setup
npm run test:setup
```

### Error: "Database 'orbital_test' does not exist"

Migrations haven't been run on the test database.

**Solution:**
```bash
# Run migrations manually
DATABASE_URL="postgresql://orbital_test_user:orbital_test_password@localhost:5433/orbital_test" npm run migrate
```

### Error: "Port 5433 is already in use"

Another container is using the test port.

**Solution:**
```bash
# Find what's using port 5433
lsof -i :5433

# Stop the test database container
docker-compose stop postgres-test

# Or remove the container entirely
docker-compose down postgres-test
```

### Tests still connecting to wrong database

Check that NODE_ENV=test is being used.

**Solution:**
```bash
# Verify environment
echo $NODE_ENV

# Run tests with explicit environment
NODE_ENV=test npm test

# Check database connection in test logs
NODE_ENV=test jest tests/quota.test.js --verbose 2>&1 | grep "DATABASE_URL\|POSTGRES"
```

### Docker not installed or not running

**Solution:**
```bash
# Check Docker status
docker --version
docker ps

# If Docker not running:
# macOS: Open Docker Desktop application
# Linux: sudo systemctl start docker
```

## Test Database Details

| Property | Value |
|----------|-------|
| Container | orbital-postgres-test |
| Database | orbital_test |
| User | orbital_test_user |
| Password | orbital_test_password |
| Host | localhost |
| Port | 5433 |
| Image | postgres:15-alpine |

## Development Workflow

### Typical Session

```bash
# 1. Start both development and test databases
docker-compose up -d

# 2. Run setup script (one time)
npm run test:setup

# 3. Run tests
npm test

# 4. Development work
npm run dev

# 5. Run tests again during development
npm run test:watch
```

### After Changing Database Schema

If you modify the database schema:

```bash
# 1. Update migrations
# 2. Run migrations on development database
DATABASE_URL="postgresql://orbital_user:orbital_dev_password@localhost:5432/orbital" npm run migrate

# 3. Run migrations on test database
DATABASE_URL="postgresql://orbital_test_user:orbital_test_password@localhost:5433/orbital_test" npm run migrate

# 4. Run tests
npm test
```

## Environment Variable Priority

When running tests, Jest loads environment variables in this order:

1. **jest.setup.js** - Sets NODE_ENV=test, loads .env.test
2. **database.js** - Checks NODE_ENV, selects appropriate .env file
3. **Result** - Tests use test database credentials

This ensures tests ALWAYS use the isolated test database, never the production database.

## Security Notes

The test credentials are:
- **NOT** used in production
- **NOT** checked into the main codebase
- **ONLY** for local development
- Configured to only accept localhost connections

Never use these credentials in production. Production credentials should:
- Use strong, randomly generated passwords
- Be stored in a secure secret manager
- Never be committed to version control
- Rotate regularly

## CI/CD Integration

For CI/CD pipelines:

```bash
# Docker-based CI/CD
docker-compose up -d postgres-test
npm run migrate
npm test

# Kubernetes or cloud-based CI/CD
# Create separate test database instance
# Set DATABASE_URL environment variable
# Run: npm test
```

## Next Steps

1. Run the setup script: `npm run test:setup`
2. Run integration tests: `npm run test:integration`
3. Verify all 28 tests pass
4. Check test coverage: `npm test`

For questions or issues, refer to the troubleshooting section above.
