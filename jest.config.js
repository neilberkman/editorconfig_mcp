module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['server.js'],
  testMatch: ['**/*.test.js'],
  testTimeout: 10000,
};
