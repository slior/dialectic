import fs from 'fs';
import path from 'path';
import { loadEnvironmentFile } from '@dialectic/core';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPath = path as jest.Mocked<typeof path>;

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));
import dotenv from 'dotenv';
const mockedDotenv = dotenv as jest.Mocked<typeof dotenv>;

// Test constants
const DEFAULT_ENV_FILE = '.env';
const CUSTOM_ENV_FILE = 'custom.env';
const MISSING_ENV_FILE = 'missing.env';
const CONFIG_ENV_FILE = 'config/.env.local';
const MOCK_CWD_DEFAULT = '/current/dir';
const MOCK_CWD_PROJECT = '/project/root';
const MOCK_RESOLVED_PREFIX = '/resolved/';
const ENV_VAR_EXISTING = 'EXISTING_VAR';
const ENV_VAR_TEST = 'TEST_VAR';
const ENV_VAR_CUSTOM = 'CUSTOM_VAR';
const ORIGINAL_VALUE = 'original_value';
const TEST_VALUE = 'test_value';
const CUSTOM_VALUE = 'custom_value';
const NEW_VALUE = 'new_value';
const ERROR_MESSAGE_ENV_FILE_NOT_FOUND = 'Environment file not found:';
const ERROR_MESSAGE_FAILED_TO_LOAD = 'Failed to load environment file:';
const WARNING_MESSAGE_NO_ENV_FILE = 'No .env file found at';

describe('env-loader', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default path mock behavior
    mockedPath.resolve.mockImplementation((_cwd, filePath) => `${MOCK_RESOLVED_PREFIX}${filePath}`);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
  });

  describe('loading default .env file', () => {
    beforeEach(() => {
      process.cwd = jest.fn().mockReturnValue(MOCK_CWD_DEFAULT);
    });

    it('should load default .env file when it exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { [ENV_VAR_TEST]: TEST_VALUE } } as any);

      loadEnvironmentFile();

      expect(mockedPath.resolve).toHaveBeenCalledWith(MOCK_CWD_DEFAULT, DEFAULT_ENV_FILE);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(`${MOCK_RESOLVED_PREFIX}${DEFAULT_ENV_FILE}`);
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: `${MOCK_RESOLVED_PREFIX}${DEFAULT_ENV_FILE}` });
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should continue silently when default .env file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => loadEnvironmentFile()).not.toThrow();
      
      expect(mockedPath.resolve).toHaveBeenCalledWith(MOCK_CWD_DEFAULT, DEFAULT_ENV_FILE);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(`${MOCK_RESOLVED_PREFIX}${DEFAULT_ENV_FILE}`);
      expect(mockedDotenv.config).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should warn about missing default .env file in verbose mode', () => {
      mockedFs.existsSync.mockReturnValue(false);

      loadEnvironmentFile(undefined, true);

      expect(stderrSpy).toHaveBeenCalledWith(`${WARNING_MESSAGE_NO_ENV_FILE} ${MOCK_RESOLVED_PREFIX}${DEFAULT_ENV_FILE}. Continuing without loading environment variables.\n`);
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });
  });

  describe('loading custom env file', () => {
    beforeEach(() => {
      process.cwd = jest.fn().mockReturnValue(MOCK_CWD_DEFAULT);
    });

    it('should load custom env file when it exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { [ENV_VAR_CUSTOM]: CUSTOM_VALUE } } as any);

      loadEnvironmentFile(CUSTOM_ENV_FILE);

      expect(mockedPath.resolve).toHaveBeenCalledWith(MOCK_CWD_DEFAULT, CUSTOM_ENV_FILE);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(`${MOCK_RESOLVED_PREFIX}${CUSTOM_ENV_FILE}`);
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: `${MOCK_RESOLVED_PREFIX}${CUSTOM_ENV_FILE}` });
    });

    it('should throw error when explicitly specified env file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const expectedError = `${ERROR_MESSAGE_ENV_FILE_NOT_FOUND} ${MOCK_RESOLVED_PREFIX}${MISSING_ENV_FILE}`;
      expect(() => loadEnvironmentFile(MISSING_ENV_FILE)).toThrow(expectedError);
      
      expect(mockedPath.resolve).toHaveBeenCalledWith(MOCK_CWD_DEFAULT, MISSING_ENV_FILE);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(`${MOCK_RESOLVED_PREFIX}${MISSING_ENV_FILE}`);
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });

    it('should throw error when explicitly specified env file does not exist, even in verbose mode', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const expectedError = `${ERROR_MESSAGE_ENV_FILE_NOT_FOUND} ${MOCK_RESOLVED_PREFIX}${MISSING_ENV_FILE}`;
      expect(() => loadEnvironmentFile(MISSING_ENV_FILE, true)).toThrow(expectedError);
      
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });
  });

  describe('path resolution', () => {
    it('should resolve paths relative to process.cwd()', () => {
      process.cwd = jest.fn().mockReturnValue(MOCK_CWD_PROJECT);
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: {} } as any);

      loadEnvironmentFile(CONFIG_ENV_FILE);

      expect(mockedPath.resolve).toHaveBeenCalledWith(MOCK_CWD_PROJECT, CONFIG_ENV_FILE);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(`${MOCK_RESOLVED_PREFIX}${CONFIG_ENV_FILE}`);
    });
  });

  describe('environment variable precedence', () => {
    it('should not override existing environment variables', () => {
      process.env[ENV_VAR_EXISTING] = ORIGINAL_VALUE;
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { [ENV_VAR_EXISTING]: NEW_VALUE } } as any);

      loadEnvironmentFile();

      // dotenv by default does not override existing env vars
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: `${MOCK_RESOLVED_PREFIX}${DEFAULT_ENV_FILE}` });
      // The original environment variable should be preserved
      expect(process.env[ENV_VAR_EXISTING]).toBe(ORIGINAL_VALUE);
    });
  });

  describe('dotenv error handling', () => {
    it('should handle dotenv parsing errors', () => {
      mockedFs.existsSync.mockReturnValue(true);
      const parseError = 'Parse error';
      mockedDotenv.config.mockReturnValue({ error: new Error(parseError) } as any);

      expect(() => loadEnvironmentFile()).toThrow(`${ERROR_MESSAGE_FAILED_TO_LOAD} ${parseError}`);
    });
  });
});

