module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/server.js'
  ],
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Ensure NODE_ENV=test for all tests
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  }
};
