import fs from 'fs';
import path from 'path';
import {
  numOrUndefined,
  averageOrNull,
  getErrorMessage,
  createValidationError,
  readJsonFile,
  writeFileWithDirectories,
} from './common';
import { EXIT_INVALID_ARGS } from './exit-codes';

// Mock fs module
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    promises: {
      writeFile: jest.fn(),
    },
  };
});

describe('common utilities', () => {
  describe('numOrUndefined', () => {
    it('should return the number for valid finite numbers', () => {
      expect(numOrUndefined(0)).toBe(0);
      expect(numOrUndefined(42)).toBe(42);
      expect(numOrUndefined(-100)).toBe(-100);
      expect(numOrUndefined(3.14)).toBe(3.14);
      expect(numOrUndefined(1e10)).toBe(1e10);
    });

    it('should return undefined for NaN', () => {
      expect(numOrUndefined(NaN)).toBeUndefined();
    });

    it('should return undefined for Infinity', () => {
      expect(numOrUndefined(Infinity)).toBeUndefined();
      expect(numOrUndefined(-Infinity)).toBeUndefined();
    });

    it('should return undefined for non-number types', () => {
      expect(numOrUndefined('42')).toBeUndefined();
      expect(numOrUndefined(null)).toBeUndefined();
      expect(numOrUndefined(undefined)).toBeUndefined();
      expect(numOrUndefined(true)).toBeUndefined();
      expect(numOrUndefined(false)).toBeUndefined();
      expect(numOrUndefined({})).toBeUndefined();
      expect(numOrUndefined([])).toBeUndefined();
      expect(numOrUndefined(() => {})).toBeUndefined();
    });
  });

  describe('averageOrNull', () => {
    it('should return null for empty array', () => {
      expect(averageOrNull([])).toBeNull();
    });

    it('should return the value for single element array', () => {
      expect(averageOrNull([42])).toBe(42);
      expect(averageOrNull([3.14])).toBe(3.14);
      expect(averageOrNull([-10])).toBe(-10);
    });

    it('should calculate average for multiple values', () => {
      expect(averageOrNull([1, 2, 3])).toBe(2);
      expect(averageOrNull([10, 20, 30, 40])).toBe(25);
      expect(averageOrNull([1, 1, 1, 1, 1])).toBe(1);
    });

    it('should round to 2 decimal places', () => {
      expect(averageOrNull([1, 2, 3, 4])).toBe(2.5);
      expect(averageOrNull([1, 3])).toBe(2);
      expect(averageOrNull([1, 1, 1])).toBe(1);
      // Test rounding behavior
      expect(averageOrNull([1, 2, 3])).toBe(2);
      expect(averageOrNull([1.111, 2.222, 3.333])).toBeCloseTo(2.22, 2);
    });

    it('should handle negative numbers', () => {
      expect(averageOrNull([-1, -2, -3])).toBe(-2);
      expect(averageOrNull([-10, 10])).toBe(0);
      expect(averageOrNull([-5, 0, 5])).toBe(0);
    });

    it('should handle decimal numbers', () => {
      expect(averageOrNull([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 2);
      expect(averageOrNull([1.5, 2.5, 3.5])).toBe(2.5);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should extract message from objects with message property', () => {
      const errorObj = { message: 'Custom error message' };
      expect(getErrorMessage(errorObj)).toBe('Custom error message');
    });

    it('should convert message property to string', () => {
      const errorObj = { message: 123 };
      expect(getErrorMessage(errorObj)).toBe('123');
    });

    it('should convert non-object types to string', () => {
      expect(getErrorMessage('string error')).toBe('string error');
      expect(getErrorMessage(42)).toBe('42');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
      expect(getErrorMessage(true)).toBe('true');
      expect(getErrorMessage(false)).toBe('false');
    });

    it('should handle objects without message property', () => {
      const errorObj = { code: 500, status: 'error' };
      expect(getErrorMessage(errorObj)).toBe('[object Object]');
    });

    it('should handle null object', () => {
      expect(getErrorMessage(null)).toBe('null');
    });

    it('should handle array objects', () => {
      expect(getErrorMessage([1, 2, 3])).toBe('1,2,3');
    });
  });

  describe('createValidationError', () => {
    it('should create an Error with the specified message', () => {
      const error = createValidationError('Test error', EXIT_INVALID_ARGS);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
    });

    it('should add code property to the error', () => {
      const error = createValidationError('Test error', EXIT_INVALID_ARGS);
      expect((error as any).code).toBe(EXIT_INVALID_ARGS);
    });

    it('should work with different exit codes', () => {
      const error1 = createValidationError('Error 1', 1);
      const error2 = createValidationError('Error 2', 2);
      const error3 = createValidationError('Error 3', 3);
      
      expect((error1 as any).code).toBe(1);
      expect((error2 as any).code).toBe(2);
      expect((error3 as any).code).toBe(3);
    });

    it('should handle empty message', () => {
      const error = createValidationError('', EXIT_INVALID_ARGS);
      expect(error.message).toBe('');
      expect((error as any).code).toBe(EXIT_INVALID_ARGS);
    });
  });

  describe('readJsonFile', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const originalCwd = process.cwd;

    beforeEach(() => {
      jest.clearAllMocks();
      // Mock process.cwd to return a predictable path
      process.cwd = jest.fn(() => '/test/working/dir');
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    it('should read and parse valid JSON file', () => {
      const filePath = 'test.json';
      const jsonContent = { key: 'value', number: 42 };
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(jsonContent));

      const result = readJsonFile(filePath);
      expect(result).toEqual(jsonContent);
      expect(mockFs.existsSync).toHaveBeenCalledWith(absPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(absPath, 'utf-8');
    });

    it('should read JSON file with custom error context', () => {
      const filePath = 'config.json';
      const jsonContent = { setting: 'value' };
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(jsonContent));

      const result = readJsonFile(filePath, 'Config file');
      expect(result).toEqual(jsonContent);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(absPath, 'utf-8');
    });

    it('should throw validation error when file does not exist', () => {
      const filePath = 'nonexistent.json';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(false);

      expect(() => readJsonFile(filePath)).toThrow();
      try {
        readJsonFile(filePath);
      } catch (error: any) {
        expect(error.message).toContain('File not found');
        expect(error.message).toContain(absPath);
        expect(error.code).toBe(EXIT_INVALID_ARGS);
      }
    });

    it('should throw validation error with custom context when file does not exist', () => {
      const filePath = 'nonexistent.json';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(false);

      expect(() => readJsonFile(filePath, 'Debate file')).toThrow();
      try {
        readJsonFile(filePath, 'Debate file');
      } catch (error: any) {
        expect(error.message).toContain('Debate file not found');
        expect(error.message).toContain(absPath);
        expect(error.code).toBe(EXIT_INVALID_ARGS);
      }
    });

    it('should throw validation error when path is not a file', () => {
      const filePath = 'directory';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => false,
      } as fs.Stats);

      expect(() => readJsonFile(filePath)).toThrow();
      try {
        readJsonFile(filePath);
      } catch (error: any) {
        expect(error.message).toContain('Path is not a file');
        expect(error.message).toContain(absPath);
        expect(error.code).toBe(EXIT_INVALID_ARGS);
      }
    });

    it('should throw validation error when JSON is invalid', () => {
      const filePath = 'invalid.json';
      const absPath = path.resolve('/test/working/dir', filePath);
      const invalidJson = '{ invalid json }';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(invalidJson);

      expect(() => readJsonFile(filePath)).toThrow();
      try {
        readJsonFile(filePath);
      } catch (error: any) {
        expect(error.message).toContain('Invalid JSON format');
        expect(error.message).toContain(absPath);
        expect(error.code).toBe(EXIT_INVALID_ARGS);
      }
    });

    it('should throw validation error with custom context when JSON is invalid', () => {
      const filePath = 'invalid.json';
      const absPath = path.resolve('/test/working/dir', filePath);
      const invalidJson = '{ invalid json }';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(invalidJson);

      expect(() => readJsonFile(filePath, 'Config file')).toThrow();
      try {
        readJsonFile(filePath, 'Config file');
      } catch (error: any) {
        expect(error.message).toContain('Invalid JSON format in config file');
        expect(error.message).toContain(absPath);
        expect(error.code).toBe(EXIT_INVALID_ARGS);
      }
    });

    it('should parse complex JSON structures', () => {
      const filePath = 'complex.json';
      const jsonContent = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        string: 'test',
        number: 42,
        boolean: true,
        nullValue: null,
      };
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(jsonContent));

      const result = readJsonFile<typeof jsonContent>(filePath);
      expect(result).toEqual(jsonContent);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(absPath, 'utf-8');
    });

    it('should use default error context when not provided', () => {
      const filePath = 'test.json';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(false);

      expect(() => readJsonFile(filePath)).toThrow();
      try {
        readJsonFile(filePath);
      } catch (error: any) {
        expect(error.message).toContain('File not found');
        expect(error.message).toContain(absPath);
      }
    });
  });

  describe('writeFileWithDirectories', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const originalCwd = process.cwd;

    beforeEach(() => {
      jest.clearAllMocks();
      process.cwd = jest.fn(() => '/test/working/dir');
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    it('should write file when parent directory exists', async () => {
      const filePath = 'existing-dir/file.txt';
      const content = 'test content';
      const absPath = path.resolve('/test/working/dir', filePath);
      const parentDir = path.dirname(absPath);

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await writeFileWithDirectories(filePath, content);

      expect(result).toBe(absPath);
      expect(mockFs.existsSync).toHaveBeenCalledWith(parentDir);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(absPath, content, 'utf-8');
    });

    it('should create parent directories when they do not exist', async () => {
      const filePath = 'new-dir/subdir/file.txt';
      const content = 'test content';
      const absPath = path.resolve('/test/working/dir', filePath);
      const parentDir = path.dirname(absPath);

      mockFs.existsSync.mockReturnValue(false);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await writeFileWithDirectories(filePath, content);

      expect(result).toBe(absPath);
      expect(mockFs.existsSync).toHaveBeenCalledWith(parentDir);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(parentDir, { recursive: true });
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(absPath, content, 'utf-8');
    });

    it('should write file with UTF-8 encoding', async () => {
      const filePath = 'file.txt';
      const content = 'test content with unicode: 你好';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      await writeFileWithDirectories(filePath, content);

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(absPath, content, 'utf-8');
    });

    it('should handle nested directory creation', async () => {
      const filePath = 'level1/level2/level3/file.txt';
      const content = 'nested content';
      const absPath = path.resolve('/test/working/dir', filePath);
      const parentDir = path.dirname(absPath);

      mockFs.existsSync.mockReturnValue(false);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      await writeFileWithDirectories(filePath, content);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(parentDir, { recursive: true });
    });

    it('should propagate file system errors', async () => {
      const filePath = 'file.txt';
      const content = 'test content';
      const fsError = new Error('Permission denied');

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.promises.writeFile as jest.Mock).mockRejectedValue(fsError);

      await expect(writeFileWithDirectories(filePath, content)).rejects.toThrow('Permission denied');
    });

    it('should propagate directory creation errors', async () => {
      const filePath = 'new-dir/file.txt';
      const content = 'test content';
      const mkdirError = new Error('Cannot create directory');

      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw mkdirError;
      });

      await expect(writeFileWithDirectories(filePath, content)).rejects.toThrow('Cannot create directory');
    });

    it('should handle empty content', async () => {
      const filePath = 'empty.txt';
      const content = '';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      await writeFileWithDirectories(filePath, content);

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(absPath, '', 'utf-8');
    });

    it('should handle relative paths with ..', async () => {
      const filePath = '../parent-dir/file.txt';
      const content = 'test content';
      const absPath = path.resolve('/test/working/dir', filePath);

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await writeFileWithDirectories(filePath, content);

      expect(result).toBe(absPath);
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(absPath, content, 'utf-8');
    });
  });
});
