import fs from 'fs';
import path from 'path';

import { getDebatesDir } from './paths';

// Mock fs module
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});

describe('paths utilities', () => {
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

  describe('getDebatesDir', () => {
    it('should return the resolved path to debates directory', () => {
      const expectedPath = path.resolve('/test/working/dir', 'debates');
      mockFs.existsSync.mockReturnValue(true);

      const result = getDebatesDir();

      expect(result).toBe(expectedPath);
      expect(process.cwd).toHaveBeenCalled();
    });

    it('should create the directory if it does not exist', () => {
      const expectedPath = path.resolve('/test/working/dir', 'debates');
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);

      const result = getDebatesDir();

      expect(result).toBe(expectedPath);
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    });

    it('should not create the directory if it already exists', () => {
      const expectedPath = path.resolve('/test/working/dir', 'debates');
      mockFs.existsSync.mockReturnValue(true);

      const result = getDebatesDir();

      expect(result).toBe(expectedPath);
      expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use recursive option when creating directory', () => {
      const expectedPath = path.resolve('/test/working/dir', 'debates');
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);

      getDebatesDir();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    });

    it('should resolve path relative to current working directory', () => {
      const customCwd = '/custom/working/directory';
      process.cwd = jest.fn(() => customCwd);
      const expectedPath = path.resolve(customCwd, 'debates');
      mockFs.existsSync.mockReturnValue(true);

      const result = getDebatesDir();

      expect(result).toBe(expectedPath);
      expect(process.cwd).toHaveBeenCalled();
    });

    it('should handle directory creation errors', () => {
      const expectedPath = path.resolve('/test/working/dir', 'debates');
      const mkdirError = new Error('Permission denied');
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw mkdirError;
      });

      expect(() => getDebatesDir()).toThrow('Permission denied');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    });

    it('should handle different working directory paths', () => {
      const testCases = [
        '/root',
        '/home/user/projects',
        'C:\\Users\\Test\\Projects',
        '/',
      ];

      testCases.forEach((cwd) => {
        jest.clearAllMocks();
        process.cwd = jest.fn(() => cwd);
        const expectedPath = path.resolve(cwd, 'debates');
        mockFs.existsSync.mockReturnValue(true);

        const result = getDebatesDir();

        expect(result).toBe(expectedPath);
      });
    });

    it('should check existence before creating directory', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);

      getDebatesDir();

      // Verify existsSync is called before mkdirSync
      const existsCallOrder = mockFs.existsSync.mock.invocationCallOrder[0];
      const mkdirCallOrder = mockFs.mkdirSync.mock.invocationCallOrder[0];
      expect(existsCallOrder).toBeDefined();
      expect(mkdirCallOrder).toBeDefined();
      expect(existsCallOrder).toBeLessThan(mkdirCallOrder!);
    });
  });
});
