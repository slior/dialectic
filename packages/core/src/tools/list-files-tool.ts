import fs from 'fs';
import path from 'path';

import { ToolSchema } from '../types/tool.types';

import { ToolImplementation, createToolErrorJson, createToolSuccessJson } from './tool-implementation';

/**
 * File system entry type constants.
 */
const FILE_SYSTEM_ENTRY_TYPE = {
  FILE: 'file',
  DIRECTORY: 'directory',
} as const;

type FileSystemEntryType = (typeof FILE_SYSTEM_ENTRY_TYPE)[keyof typeof FILE_SYSTEM_ENTRY_TYPE];

/**
 * Represents a file system entry (file or directory).
 */
interface FileSystemEntry {
  path: string;
  type: FileSystemEntryType;
}

/**
 * List Files tool allows agents to list files and directories in a given directory.
 * Returns an array of entries with their absolute paths and types.
 */
export class ListFilesTool implements ToolImplementation {
  name = 'list_files';

  schema: ToolSchema = {
    name: 'list_files',
    description: 'List all files and directories in a given directory. Returns an array of entries with their absolute paths and types (file or directory).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the directory to list',
        },
      },
      required: ['path'],
    },
  };

  /**
   * Executes the list files tool.
   * Lists all files and directories in the given directory.
   * 
   * @param args - Tool arguments containing the directory path.
   * @param _context - Optional debate context (unused for this tool).
   * @param _state - Optional debate state (unused for this tool).
   * @returns JSON string with status and array of file system entries or error message.
   */
  // Parameters _context and _state are required by ToolImplementation interface but unused by this tool
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute(args: { path?: string }, _context?: unknown, _state?: unknown): string {
    const validationError = this.verifyToolArguments(args);
    if (validationError) {
      return validationError;
    }

    // After validation, args.path is guaranteed to be defined
    const dirPath = args.path!;

    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(dirPath);

      // Check if directory exists
      if (!fs.existsSync(absolutePath)) {
        return createToolErrorJson(`Directory not found: ${absolutePath}`);
      }

      // Check if path is a directory (not a file)
      const stats = fs.statSync(absolutePath);
      if (!stats.isDirectory()) {
        return createToolErrorJson(`Path is not a directory: ${absolutePath}`);
      }

      // Read directory contents
      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

      // Build result array with absolute paths and types
      const result: FileSystemEntry[] = entries.map((entry) => {
        const entryPath = path.join(absolutePath, entry.name);
        const absoluteEntryPath = path.resolve(entryPath);

        return {
          path: absoluteEntryPath,
          type: entry.isDirectory() ? FILE_SYSTEM_ENTRY_TYPE.DIRECTORY : FILE_SYSTEM_ENTRY_TYPE.FILE,
        };
      });

      return createToolSuccessJson({
        entries: result,
      });
    } catch (error: unknown) {
      // Handle file system errors
      const errorMessage = this.getErrorMessage(error);
      const errorCode = this.getErrorCode(error);

      if (errorCode === 'ENOENT') {
        return createToolErrorJson(`Directory not found: ${dirPath}`);
      }

      if (errorCode === 'EACCES' || errorCode === 'EPERM') {
        return createToolErrorJson(`Permission denied: ${dirPath}`);
      }

      // Generic error message
      return createToolErrorJson(`Error listing directory ${dirPath}: ${errorMessage}`);
    }
  }

  /**
   * Verifies that the tool arguments are valid.
   * 
   * @param args - Tool arguments containing the directory path.
   * @returns Error JSON string if validation fails, null if validation passes.
   */
  private verifyToolArguments(args: { path?: string }): string | null {
    if (!args.path || typeof args.path !== 'string') {
      return createToolErrorJson('Directory path is required and must be a string');
    }

    if (args.path.trim() === '') {
      return createToolErrorJson('Directory path cannot be empty');
    }

    return null;
  }

  /**
   * Extracts an error message from an unknown error value.
   * 
   * @param error - The error value (unknown type from catch clause).
   * @returns A string representation of the error message.
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message);
    }
    return String(error);
  }

  /**
   * Extracts an error code from a Node.js error object.
   * 
   * @param error - The error value (unknown type from catch clause).
   * @returns The error code if available, undefined otherwise.
   */
  private getErrorCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return String(error.code);
    }
    return undefined;
  }
}
