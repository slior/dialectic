import fs from 'fs';
import os from 'os';
import path from 'path';

import { LIST_FILES_TOOL_NAME, ListFilesTool } from './list-files-tool';

// Test constants
const TOOL_NAME_LIST_FILES = LIST_FILES_TOOL_NAME;
const PARAM_TYPE_OBJECT = 'object';
const PARAM_TYPE_STRING = 'string';
const PARAM_NAME_PATH = 'path';
const RESULT_STATUS_SUCCESS = 'success';
const RESULT_STATUS_ERROR = 'error';
const FILE_TYPE_FILE = 'file';
const FILE_TYPE_DIRECTORY = 'directory';
const FILE_NAME_1 = 'file1.txt';
const FILE_NAME_2 = 'file2.txt';
const DIR_NAME_1 = 'subdir1';
const DIR_NAME_2 = 'subdir2';
const FILE_CONTENT_TEST = 'This is test file content\nWith multiple lines\nAnd special chars: !@#$%';

describe('ListFilesTool', () => {
  let tool: ListFilesTool;
  let tempDir: string;
  let testDirPath: string;
  let testFilePath: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'list-files-tool-test-'));
    
    // Create tool with tempDir as context directory
    tool = new ListFilesTool(tempDir);
    
    testDirPath = path.join(tempDir, 'test-dir');
    testFilePath = path.join(tempDir, 'test-file.txt');
    
    // Create test directory
    fs.mkdirSync(testDirPath, { recursive: true });
    
    // Create test file (outside test directory)
    fs.writeFileSync(testFilePath, 'test content', 'utf-8');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Tool Schema', () => {
    it('should match OpenAI function calling format', () => {
      const schema = tool.schema;
      expect(schema.name).toBe(TOOL_NAME_LIST_FILES);
      expect(schema.description).toContain('List');
      expect(schema.parameters.type).toBe(PARAM_TYPE_OBJECT);
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_PATH]).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_PATH]?.type).toBe(PARAM_TYPE_STRING);
      expect(schema.parameters.required).toContain(PARAM_NAME_PATH);
    });
  });

  describe('Tool Execution - Success Cases', () => {
    it('should successfully list files and directories', () => {
      // Create files and directories in test directory
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      const file2Path = path.join(testDirPath, FILE_NAME_2);
      const dir1Path = path.join(testDirPath, DIR_NAME_1);
      const dir2Path = path.join(testDirPath, DIR_NAME_2);

      fs.writeFileSync(file1Path, 'content1', 'utf-8');
      fs.writeFileSync(file2Path, 'content2', 'utf-8');
      fs.mkdirSync(dir1Path, { recursive: true });
      fs.mkdirSync(dir2Path, { recursive: true });

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.entries).toBeDefined();
      expect(Array.isArray(parsed.result.entries)).toBe(true);
      expect(parsed.result.entries.length).toBe(4);
    });

    it('should return entries with absolute paths', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      const entry = parsed.result.entries.find((e: { path: string }) => e.path.includes(FILE_NAME_1));
      expect(entry).toBeDefined();
      expect(path.isAbsolute(entry.path)).toBe(true);
    });

    it('should distinguish between files and directories', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      const dir1Path = path.join(testDirPath, DIR_NAME_1);

      fs.writeFileSync(file1Path, 'content', 'utf-8');
      fs.mkdirSync(dir1Path, { recursive: true });

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      
      const fileEntry = parsed.result.entries.find((e: { path: string }) => e.path.includes(FILE_NAME_1));
      const dirEntry = parsed.result.entries.find((e: { path: string }) => e.path.includes(DIR_NAME_1));

      expect(fileEntry).toBeDefined();
      expect(fileEntry.type).toBe(FILE_TYPE_FILE);
      expect(dirEntry).toBeDefined();
      expect(dirEntry.type).toBe(FILE_TYPE_DIRECTORY);
    });

    it('should return empty array for empty directory', () => {
      const emptyDirPath = path.join(tempDir, 'empty-dir');
      fs.mkdirSync(emptyDirPath, { recursive: true });

      const result = tool.execute({ [PARAM_NAME_PATH]: emptyDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries).toEqual([]);
    });

    it('should handle relative paths by resolving to absolute', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      // Use relative path from context directory (tempDir)
      // Note: path.resolve() resolves relative paths relative to process.cwd(),
      // so we temporarily change the working directory to tempDir to test relative paths
      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const relativePath = path.relative(tempDir, testDirPath);
        const result = tool.execute({ [PARAM_NAME_PATH]: relativePath });
        const parsed = JSON.parse(result);

        expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
        expect(parsed.result.entries.length).toBeGreaterThan(0);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle absolute paths', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      const absolutePath = path.resolve(testDirPath);
      const result = tool.execute({ [PARAM_NAME_PATH]: absolutePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBeGreaterThan(0);
    });

    it('should list all entries in directory', () => {
      // Create multiple files and directories
      const files = ['a.txt', 'b.txt', 'c.txt'];
      const dirs = ['dir1', 'dir2'];

      files.forEach((file) => {
        fs.writeFileSync(path.join(testDirPath, file), 'content', 'utf-8');
      });
      dirs.forEach((dir) => {
        fs.mkdirSync(path.join(testDirPath, dir), { recursive: true });
      });

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBe(files.length + dirs.length);
    });
  });

  describe('Tool Execution - Error Cases', () => {
    it('should return error when directory does not exist', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent-dir');

      const result = tool.execute({ [PARAM_NAME_PATH]: nonExistentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('not found');
    });

    it('should return error when path is a file', () => {
      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('not a directory');
    });

    it('should return error when path argument is missing', () => {
      const invalidArgs: Record<string, unknown> = {};
      const result = tool.execute(invalidArgs as { path?: string });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('required');
    });

    it('should return error when path argument is not a string', () => {
      const invalidArgs: Record<string, unknown> = { [PARAM_NAME_PATH]: 123 };
      const result = tool.execute(invalidArgs as { path?: string });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('string');
    });

    it('should return error when path argument is empty string', () => {
      const result = tool.execute({ [PARAM_NAME_PATH]: '' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      // Empty string is falsy, so it's caught by the "required" check
      expect(parsed.error).toContain('required');
    });

    it('should return error when path argument is whitespace only', () => {
      const result = tool.execute({ [PARAM_NAME_PATH]: '   ' });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('empty');
    });
  });

  describe('Result Formatting', () => {
    it('should return JSON string with status and result', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('result');
      expect(parsed.result).toHaveProperty('entries');
      expect(Array.isArray(parsed.result.entries)).toBe(true);
    });

    it('should return entries with path and type properties', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      if (parsed.result.entries.length > 0) {
        const entry = parsed.result.entries[0];
        expect(entry).toHaveProperty('path');
        expect(entry).toHaveProperty('type');
        expect(typeof entry.path).toBe('string');
        expect(typeof entry.type).toBe('string');
        expect([FILE_TYPE_FILE, FILE_TYPE_DIRECTORY]).toContain(entry.type);
      }
    });

    it('should return JSON string with status and error for failures', () => {
      // Use a path within context directory that doesn't exist
      const nonExistentPath = path.join(tempDir, 'non-existent-dir');
      const result = tool.execute({ [PARAM_NAME_PATH]: nonExistentPath });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Path Resolution', () => {
    it('should resolve paths with .. correctly', () => {
      const subDir = path.join(testDirPath, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      const fileInSubDir = path.join(subDir, 'file.txt');
      fs.writeFileSync(fileInSubDir, 'content', 'utf-8');

      // Use .. to go up one level
      const parentPath = path.join(subDir, '..');
      const result = tool.execute({ [PARAM_NAME_PATH]: parentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBeGreaterThan(0);
    });

    it('should resolve paths with . correctly', () => {
      const file1Path = path.join(testDirPath, FILE_NAME_1);
      fs.writeFileSync(file1Path, 'content', 'utf-8');

      // Use . for current directory
      const currentPath = path.join(testDirPath, '.');
      const result = tool.execute({ [PARAM_NAME_PATH]: currentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBeGreaterThan(0);
    });
  });

  describe('Entry Ordering', () => {
    it('should return entries in consistent order', () => {
      // Create files with specific names
      const files = ['z.txt', 'a.txt', 'm.txt'];
      files.forEach((file) => {
        fs.writeFileSync(path.join(testDirPath, file), 'content', 'utf-8');
      });

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBe(files.length);
      
      // Verify all files are present
      const entryPaths = parsed.result.entries.map((e: { path: string }) => path.basename(e.path));
      files.forEach((file) => {
        expect(entryPaths).toContain(file);
      });
    });
  });

  describe('Error Handling - File System Errors', () => {
    it('should handle generic file system errors', () => {
      // Mock readdirSync to throw a generic error
      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        const mockError = new Error('Generic directory error');
        (mockError as { code?: string }).code = 'UNKNOWN_ERROR';
        throw mockError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      // Mock realpathSync to allow path validation to pass
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error listing directory');
      expect(parsed.error).toContain('Generic directory error');

      // Restore spies
      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should handle errors without code property', () => {
      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('Error without code');
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      // Mock realpathSync to allow path validation to pass
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error listing directory');
      expect(parsed.error).toContain('Error without code');

      // Restore spies
      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should handle non-Error objects thrown', () => {
      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw { message: 'Object error' };
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      // Mock realpathSync to allow path validation to pass
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error listing directory');

      // Restore spies
      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should handle primitive error values', () => {
      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw 'String error';
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      // Mock realpathSync to allow path validation to pass
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error listing directory');

      // Restore spies
      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should return Directory not found when readdir throws ENOENT', () => {
      const enoentError = new Error('ENOENT: no such file or directory');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';

      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw enoentError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`Directory not found: ${testDirPath}`);

      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should return Permission denied when readdir throws EACCES', () => {
      const eaccesError = new Error('EACCES: permission denied');
      (eaccesError as NodeJS.ErrnoException).code = 'EACCES';

      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw eaccesError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`Permission denied: ${testDirPath}`);

      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });

    it('should return Permission denied when readdir throws EPERM', () => {
      const epermError = new Error('EPERM: operation not permitted');
      (epermError as NodeJS.ErrnoException).code = 'EPERM';

      const readdirSyncSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw epermError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
      const realpathSyncSpy = jest.spyOn(fs, 'realpathSync').mockImplementation((p) => String(p));

      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`Permission denied: ${testDirPath}`);

      readdirSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
      realpathSyncSpy.mockRestore();
    });
  });

  describe('Context Directory Security', () => {
    let contextDir: string;
    let subDirInContext: string;
    let fileInContext: string;
    let dirOutsideContext: string;
    let parentDir: string;

    beforeEach(() => {
      // Create context directory structure
      contextDir = path.join(tempDir, 'context');
      parentDir = tempDir;
      subDirInContext = path.join(contextDir, 'subdir');
      fileInContext = path.join(contextDir, 'file.txt');
      dirOutsideContext = path.join(parentDir, 'outside');

      fs.mkdirSync(contextDir, { recursive: true });
      fs.mkdirSync(subDirInContext, { recursive: true });
      fs.mkdirSync(dirOutsideContext, { recursive: true });
      fs.writeFileSync(fileInContext, FILE_CONTENT_TEST, 'utf-8');
    });

    it('should allow listing directories within context directory', () => {
      const toolWithContext = new ListFilesTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: subDirInContext });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries).toBeDefined();
    });

    it('should reject directories outside context directory', () => {
      const toolWithContext = new ListFilesTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: dirOutsideContext });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe('Access denied: path is outside the context directory');
    });

    it('should reject paths with .. traversal outside context directory', () => {
      const toolWithContext = new ListFilesTool(contextDir);
      const traversalPath = path.join(contextDir, '..', 'outside');
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: traversalPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe('Access denied: path is outside the context directory');
    });

    it('should filter out entries outside context directory', () => {
      // Create a symlink or entry that points outside (simulated by creating entry outside)
      const toolWithContext = new ListFilesTool(contextDir);
      
      // Create a file outside the context directory
      const fileOutside = path.join(parentDir, 'outside-file.txt');
      fs.writeFileSync(fileOutside, FILE_CONTENT_TEST, 'utf-8');

      // List the context directory - should only show files within context
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: contextDir });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      // Should only contain entries within context directory
      parsed.result.entries.forEach((entry: { path: string }) => {
        expect(entry.path).toContain(contextDir);
      });
    });

    it('should allow relative paths within context directory', () => {
      const toolWithContext = new ListFilesTool(contextDir);
      // Note: path.resolve() resolves relative paths relative to process.cwd(),
      // so we need to change the working directory to contextDir for relative paths to work
      const originalCwd = process.cwd();
      try {
        process.chdir(contextDir);
        const relativePath = path.relative(contextDir, subDirInContext);
        const result = toolWithContext.execute({ [PARAM_NAME_PATH]: relativePath });
        const parsed = JSON.parse(result);

        expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
        expect(parsed.result.entries).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should default to current working directory when context directory not provided', () => {
      const toolDefault = new ListFilesTool();
      // Use an absolute path to ensure it resolves correctly
      const cwdPath = path.resolve(process.cwd());
      const result = toolDefault.execute({ [PARAM_NAME_PATH]: cwdPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries).toBeDefined();
    });

    it('should handle nested directories within context directory', () => {
      const nestedDir = path.join(contextDir, 'nested', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, 'file.txt'), FILE_CONTENT_TEST, 'utf-8');

      const toolWithContext = new ListFilesTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: nestedDir });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.entries.length).toBeGreaterThan(0);
    });
  });
});
