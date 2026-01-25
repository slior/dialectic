import fs from 'fs';
import os from 'os';
import path from 'path';

import { FILE_READ_TOOL_NAME, FileReadTool } from './file-read-tool';

// Test constants
const TOOL_NAME_FILE_READ = FILE_READ_TOOL_NAME;
const PARAM_TYPE_OBJECT = 'object';
const PARAM_TYPE_STRING = 'string';
const PARAM_NAME_PATH = 'path';
const RESULT_STATUS_SUCCESS = 'success';
const RESULT_STATUS_ERROR = 'error';
const FILE_CONTENT_TEST = 'This is test file content\nWith multiple lines\nAnd special chars: !@#$%';
const FILE_CONTENT_EMPTY = '';

describe('FileReadTool', () => {
  let tool: FileReadTool;
  let tempDir: string;
  let testFilePath: string;
  let testDirPath: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'file-read-tool-test-'));
    testFilePath = path.join(tempDir, 'test-file.txt');
    testDirPath = path.join(tempDir, 'test-dir');
    
    // Create test directory
    fs.mkdirSync(testDirPath, { recursive: true });
    
    // Create tool with tempDir as context directory
    tool = new FileReadTool(tempDir);
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
      expect(schema.name).toBe(TOOL_NAME_FILE_READ);
      expect(schema.description).toContain('Read');
      expect(schema.parameters.type).toBe(PARAM_TYPE_OBJECT);
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_PATH]).toBeDefined();
      expect(schema.parameters.properties?.[PARAM_NAME_PATH]?.type).toBe(PARAM_TYPE_STRING);
      expect(schema.parameters.required).toContain(PARAM_NAME_PATH);
    });
  });

  describe('Tool Execution - Success Cases', () => {
    it('should successfully read a text file', () => {
      // Create test file
      fs.writeFileSync(testFilePath, FILE_CONTENT_TEST, 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });

    it('should successfully read an empty file', () => {
      // Create empty file
      fs.writeFileSync(testFilePath, FILE_CONTENT_EMPTY, 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_EMPTY);
    });

    it('should handle relative paths by resolving to absolute', () => {
      // Create test file
      fs.writeFileSync(testFilePath, FILE_CONTENT_TEST, 'utf-8');

      // Use relative path
      const relativePath = path.relative(process.cwd(), testFilePath);
      const result = tool.execute({ [PARAM_NAME_PATH]: relativePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });

    it('should handle absolute paths', () => {
      // Create test file
      fs.writeFileSync(testFilePath, FILE_CONTENT_TEST, 'utf-8');

      const absolutePath = path.resolve(testFilePath);
      const result = tool.execute({ [PARAM_NAME_PATH]: absolutePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });

    it('should read files with special characters in content', () => {
      const specialContent = 'Line 1\nLine 2\tTabbed\nLine 3\r\nWindows\nUnicode: 你好世界\nEmoji: 🚀';
      fs.writeFileSync(testFilePath, specialContent, 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(specialContent);
    });
  });

  describe('Tool Execution - Error Cases', () => {
    it('should return error when file does not exist', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent-file.txt');

      const result = tool.execute({ [PARAM_NAME_PATH]: nonExistentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('not found');
    });

    it('should return error when path is a directory', () => {
      const result = tool.execute({ [PARAM_NAME_PATH]: testDirPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('not a file');
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
      fs.writeFileSync(testFilePath, FILE_CONTENT_TEST, 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('result');
      expect(parsed.result).toHaveProperty('content');
    });

    it('should return JSON string with status and error for failures', () => {
      const result = tool.execute({ [PARAM_NAME_PATH]: '/non/existent/path.txt' });

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('File Encoding', () => {
    it('should read UTF-8 encoded files correctly', () => {
      const utf8Content = 'UTF-8: Café, résumé, naïve, 你好, 🎉';
      fs.writeFileSync(testFilePath, utf8Content, 'utf-8');

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(utf8Content);
    });
  });

  describe('Path Resolution', () => {
    it('should resolve paths with .. correctly', () => {
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      const fileInSubDir = path.join(subDir, 'file.txt');
      fs.writeFileSync(fileInSubDir, FILE_CONTENT_TEST, 'utf-8');

      // Use .. to go up one level
      const parentPath = path.join(subDir, '..', 'subdir', 'file.txt');
      const result = tool.execute({ [PARAM_NAME_PATH]: parentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });

    it('should resolve paths with . correctly', () => {
      fs.writeFileSync(testFilePath, FILE_CONTENT_TEST, 'utf-8');

      // Use . for current directory
      const currentPath = path.join(path.dirname(testFilePath), '.', path.basename(testFilePath));
      const result = tool.execute({ [PARAM_NAME_PATH]: currentPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });
  });

  describe('Error Handling - File System Errors', () => {
    it('should handle generic file system errors', () => {
      // Mock readFileSync to throw a generic error
      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        const mockError = new Error('Generic file system error');
        (mockError as { code?: string }).code = 'UNKNOWN_ERROR';
        throw mockError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error reading file');
      expect(parsed.error).toContain('Generic file system error');

      // Restore spies
      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should handle errors without code property', () => {
      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Error without code');
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error reading file');
      expect(parsed.error).toContain('Error without code');

      // Restore spies
      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should handle non-Error objects thrown', () => {
      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw { message: 'Object error' };
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error reading file');

      // Restore spies
      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should handle primitive error values', () => {
      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw 'String error';
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toContain('Error reading file');

      // Restore spies
      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should return File not found when read throws ENOENT', () => {
      const enoentError = new Error('ENOENT: no such file or directory');
      (enoentError as NodeJS.ErrnoException).code = 'ENOENT';

      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw enoentError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`File not found: ${testFilePath}`);

      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should return Permission denied when read throws EACCES', () => {
      const eaccesError = new Error('EACCES: permission denied');
      (eaccesError as NodeJS.ErrnoException).code = 'EACCES';

      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw eaccesError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`Permission denied: ${testFilePath}`);

      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });

    it('should return Permission denied when read throws EPERM', () => {
      const epermError = new Error('EPERM: operation not permitted');
      (epermError as NodeJS.ErrnoException).code = 'EPERM';

      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw epermError;
      });

      const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as fs.Stats);

      const result = tool.execute({ [PARAM_NAME_PATH]: testFilePath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(`Permission denied: ${testFilePath}`);

      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    });
  });

  describe('Context Directory Security', () => {
    let contextDir: string;
    let fileInContext: string;
    let fileOutsideContext: string;
    let parentDir: string;

    beforeEach(() => {
      // Create context directory structure
      contextDir = path.join(tempDir, 'context');
      parentDir = tempDir;
      fileInContext = path.join(contextDir, 'allowed.txt');
      fileOutsideContext = path.join(parentDir, 'outside.txt');

      fs.mkdirSync(contextDir, { recursive: true });
      fs.writeFileSync(fileInContext, FILE_CONTENT_TEST, 'utf-8');
      fs.writeFileSync(fileOutsideContext, FILE_CONTENT_TEST, 'utf-8');
    });

    it('should allow reading files within context directory', () => {
      const toolWithContext = new FileReadTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: fileInContext });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });

    it('should reject files outside context directory', () => {
      const toolWithContext = new FileReadTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: fileOutsideContext });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe('Access denied: path is outside the context directory');
    });

    it('should reject paths with .. traversal outside context directory', () => {
      const toolWithContext = new FileReadTool(contextDir);
      const traversalPath = path.join(contextDir, '..', 'outside.txt');
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: traversalPath });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe('Access denied: path is outside the context directory');
    });

    it('should allow relative paths within context directory', () => {
      const toolWithContext = new FileReadTool(contextDir);
      // Note: path.resolve() resolves relative paths relative to process.cwd(),
      // so we need to change the working directory to contextDir for relative paths to work
      const originalCwd = process.cwd();
      try {
        process.chdir(contextDir);
        const relativePath = path.relative(contextDir, fileInContext);
        const result = toolWithContext.execute({ [PARAM_NAME_PATH]: relativePath });
        const parsed = JSON.parse(result);

        expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
        expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should default to current working directory when context directory not provided', () => {
      const toolDefault = new FileReadTool();
      const cwd = process.cwd();
      const fileInCwd = path.join(cwd, 'test-file.txt');
      
      // Create file in CWD for test
      fs.writeFileSync(fileInCwd, FILE_CONTENT_TEST, 'utf-8');
      
      try {
        const result = toolDefault.execute({ [PARAM_NAME_PATH]: fileInCwd });
        const parsed = JSON.parse(result);
        // File should be accessible since it's in CWD and tool defaults to CWD
        expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      } finally {
        // Clean up
        if (fs.existsSync(fileInCwd)) {
          fs.unlinkSync(fileInCwd);
        }
      }
    });

    it('should handle nested directories within context directory', () => {
      const nestedDir = path.join(contextDir, 'nested', 'deep');
      const nestedFile = path.join(nestedDir, 'file.txt');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(nestedFile, FILE_CONTENT_TEST, 'utf-8');

      const toolWithContext = new FileReadTool(contextDir);
      const result = toolWithContext.execute({ [PARAM_NAME_PATH]: nestedFile });
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe(RESULT_STATUS_SUCCESS);
      expect(parsed.result.content).toBe(FILE_CONTENT_TEST);
    });
  });
});
