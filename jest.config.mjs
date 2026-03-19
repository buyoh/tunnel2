export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleFileExtensions: ['mts', 'ts', 'mjs', 'js', 'json'],
  extensionsToTreatAsEsm: ['.mts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '^@tunnel2/signaling-types$': '<rootDir>/packages/signaling-types/src/index.mts',
  },
  transform: {
    '^.+\\.mts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testMatch: ['<rootDir>/src/**/*.spec.mts', '<rootDir>/packages/**/*.spec.mts'],
};