import fs from 'fs';
import path from 'path';
import { loadEnvironmentFile } from '../src/utils/env-loader';

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
    mockedPath.resolve.mockImplementation((_cwd, filePath) => `/resolved/${filePath}`);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
  });

  describe('loading default .env file', () => {
    beforeEach(() => {
      process.cwd = jest.fn().mockReturnValue('/current/dir');
    });

    it('should load default .env file when it exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { TEST_VAR: 'test_value' } } as any);

      loadEnvironmentFile();

      expect(mockedPath.resolve).toHaveBeenCalledWith('/current/dir', '.env');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/resolved/.env');
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: '/resolved/.env' });
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should continue silently when default .env file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => loadEnvironmentFile()).not.toThrow();
      
      expect(mockedPath.resolve).toHaveBeenCalledWith('/current/dir', '.env');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/resolved/.env');
      expect(mockedDotenv.config).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should warn about missing default .env file in verbose mode', () => {
      mockedFs.existsSync.mockReturnValue(false);

      loadEnvironmentFile(undefined, true);

      expect(stderrSpy).toHaveBeenCalledWith('No .env file found at /resolved/.env. Continuing without loading environment variables.\n');
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });
  });

  describe('loading custom env file', () => {
    beforeEach(() => {
      process.cwd = jest.fn().mockReturnValue('/current/dir');
    });

    it('should load custom env file when it exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { CUSTOM_VAR: 'custom_value' } } as any);

      loadEnvironmentFile('custom.env');

      expect(mockedPath.resolve).toHaveBeenCalledWith('/current/dir', 'custom.env');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/resolved/custom.env');
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: '/resolved/custom.env' });
    });

    it('should throw error when explicitly specified env file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => loadEnvironmentFile('missing.env')).toThrow('Environment file not found: /resolved/missing.env');
      
      expect(mockedPath.resolve).toHaveBeenCalledWith('/current/dir', 'missing.env');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/resolved/missing.env');
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });

    it('should throw error when explicitly specified env file does not exist, even in verbose mode', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => loadEnvironmentFile('missing.env', true)).toThrow('Environment file not found: /resolved/missing.env');
      
      expect(mockedDotenv.config).not.toHaveBeenCalled();
    });
  });

  describe('path resolution', () => {
    it('should resolve paths relative to process.cwd()', () => {
      process.cwd = jest.fn().mockReturnValue('/project/root');
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: {} } as any);

      loadEnvironmentFile('config/.env.local');

      expect(mockedPath.resolve).toHaveBeenCalledWith('/project/root', 'config/.env.local');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('/resolved/config/.env.local');
    });
  });

  describe('environment variable precedence', () => {
    it('should not override existing environment variables', () => {
      process.env.EXISTING_VAR = 'original_value';
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ parsed: { EXISTING_VAR: 'new_value' } } as any);

      loadEnvironmentFile();

      // dotenv by default does not override existing env vars
      expect(mockedDotenv.config).toHaveBeenCalledWith({ path: '/resolved/.env' });
      // The original environment variable should be preserved
      expect(process.env.EXISTING_VAR).toBe('original_value');
    });
  });

  describe('dotenv error handling', () => {
    it('should handle dotenv parsing errors', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedDotenv.config.mockReturnValue({ error: new Error('Parse error') } as any);

      expect(() => loadEnvironmentFile()).toThrow('Failed to load environment file: Parse error');
    });
  });
});