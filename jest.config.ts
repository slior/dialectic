import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  clearMocks: true,
  collectCoverage: false,
  verbose: false,
  moduleNameMapper: {
    '^langfuse$': '<rootDir>/tests/__mocks__/langfuse.ts',
  },
};

export default config;
