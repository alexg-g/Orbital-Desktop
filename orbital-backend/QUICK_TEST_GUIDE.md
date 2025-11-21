# Quick Integration Test Guide

## 5-Minute Setup

```bash
# 1. One-time setup (starts Docker container + runs migrations)
npm run test:setup

# 2. Run all integration tests
npm run test:integration

# Expected output:
# PASS tests/quota.test.js
# Test Suites: 1 passed, 1 total
# Tests:       28 passed, 28 total
```

## Common Commands

| Task | Command |
|------|---------|
| Setup test database | `npm run test:setup` |
| Run integration tests | `npm run test:integration` |
| Run unit tests | `npm run test:unit` |
| Run all tests | `npm test` |
| Watch mode (auto-rerun) | `npm run test:watch` |

## Troubleshooting

**Problem:** Port 5433 already in use
```bash
docker-compose stop postgres-test
docker-compose up -d postgres-test
```

**Problem:** Tests still failing after setup
```bash
# Verify Docker container is running
docker ps | grep orbital-postgres-test

# Re-run setup
npm run test:setup
```

**Problem:** Check environment variables
```bash
# View loaded configuration
npm run test:integration 2>&1 | grep "DATABASE_URL"
```

## Architecture

```
Development (5432)  ← .env.local
Testing (5433)      ← .env.test
```

Tests automatically use isolated test database on port 5433.

## Test Results (Current)

- Integration Tests: 28/28 passing
- Unit Tests: 23/23 passing
- Test Database: Running and healthy
- Coverage: Available via `npm test`

## Documentation

For detailed information, see:
- `TEST_DATABASE_SETUP.md` - Comprehensive setup guide
- `INTEGRATION_TEST_SETUP.md` - Implementation details
