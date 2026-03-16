export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleFileExtensions: ['mts', 'ts', 'mjs', 'js', 'json'],
  extensionsToTreatAsEsm: ['.mts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
  },
  transform: {
    '^.+\\.mts$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['<rootDir>/src/**/*.spec.mts'],
};