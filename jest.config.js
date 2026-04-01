module.exports = {
  roots: ['<rootDir>/.test-dist/tests'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/.test-dist/tests/system/'],
}
