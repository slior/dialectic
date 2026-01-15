import fs from 'fs';
import path from 'path';

import { ToolSchema } from '../types/tool.types';

import { ToolImplementation, createToolErrorJson, createToolSuccessJson } from './tool-implementation';

/**
 * Tool name constant for the File Read tool.
 */
export const FILE_READ_TOOL_NAME = 'file_read';

/**
 * File Read tool allows agents to read the contents of text files.
 * Returns the file content as a string, or an error message if the file cannot be read.
 */
export class FileReadTool implements ToolImplementation {
  name = FILE_READ_TOOL_NAME;

  schema: ToolSchema = {
    name: FILE_READ_TOOL_NAME,
    description: 'Read the contents of a text file. Returns the file content as a string, or an error message if the file cannot be read.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute path to the file to read',
        },
      },
      required: ['path'],
    },
  };

  /**
   * Executes the file read tool.
   * Reads the file at the given path and returns its contents.
   * 
   * @param args - Tool arguments containing the file path.
   * @param _context - Optional debate context (unused for this tool).
   * @param _state - Optional debate state (unused for this tool).
   * @returns JSON string with status and file content or error message.
   */
  // Parameters _context and _state are required by ToolImplementation interface but unused by this tool
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute(args: { path?: string }, _context?: unknown, _state?: unknown): string {
    const validationError = this.verifyToolArguments(args);
    if (validationError) {
      return validationError;
    }

    // After validation, args.path is guaranteed to be defined
    const filePath = args.path!;

    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        return createToolErrorJson(`File not found: ${absolutePath}`);
      }

      // Check if path is a file (not a directory)
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        return createToolErrorJson(`Path is not a file: ${absolutePath}`);
      }

      // Read file content
      const content = fs.readFileSync(absolutePath, 'utf-8');

      return createToolSuccessJson({
        content,
      });
    } catch (error: unknown) {
      // Handle file system errors
      const errorMessage = this.getErrorMessage(error);
      const errorCode = this.getErrorCode(error);

      if (errorCode === 'ENOENT') {
        return createToolErrorJson(`File not found: ${filePath}`);
      }

      if (errorCode === 'EACCES' || errorCode === 'EPERM') {
        return createToolErrorJson(`Permission denied: ${filePath}`);
      }

      // Generic error message
      return createToolErrorJson(`Error reading file ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Verifies that the tool arguments are valid.
   * 
   * @param args - Tool arguments containing the file path.
   * @returns Error JSON string if validation fails, null if validation passes.
   */
  private verifyToolArguments(args: { path?: string }): string | null {
    if (!args.path || typeof args.path !== 'string') {
      return createToolErrorJson('File path is required and must be a string');
    }

    if (args.path.trim() === '') {
      return createToolErrorJson('File path cannot be empty');
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
