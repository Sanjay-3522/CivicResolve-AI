const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  collectCoverageFrom: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', '!**/*.d.ts'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  coverageThreshold: { global: { statements: 80, branches: 80, functions: 80, lines: 80 } },
}

module.exports = createJestConfig(customJestConfig)
