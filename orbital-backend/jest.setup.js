// Load environment variables for tests
// For tests, use .env.test to get isolated test database
// NODE_ENV=test should already be set by Jest, but we set it here to be safe

const path = require('path');
const fs = require('fs');

// Set NODE_ENV to test if not already set
if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test';
}

// Explicitly load .env.test with override to ensure test database is used
const envTestPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath, override: true });
  console.log('[Jest Setup] Loaded .env.test for isolated test database');
} else {
  console.warn('[Jest Setup] WARNING: .env.test not found at', envTestPath);
  console.warn('[Jest Setup] Tests will attempt to use default environment');
}
