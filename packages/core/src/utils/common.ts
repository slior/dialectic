import fs from 'fs';
import path from 'path';
import { round2 } from '../types/eval.types';
import { EXIT_INVALID_ARGS } from './exit-codes';

const FILE_ENCODING_UTF8 = 'utf-8';

/**
 * Validates that a value is a finite number and returns it, or undefined if invalid.
 * 
 * @param x - The value to validate as a number.
 * @returns The number if valid and finite, otherwise undefined.
 */
export function numOrUndefined(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

/**
 * Calculates the average of an array of numbers.
 * 
 * @param {number[]} values - An array of numbers to average.
 * @returns {number | null} The average rounded to 2 decimal places, or null if the array is empty.
 */
export function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return round2(sum / values.length);
}

/**
 * Safely extracts an error message from an unknown error value.
 * Handles Error objects, objects with message property, and converts other types to strings.
 * 
 * This utility function is useful for safely accessing error messages from catch clauses,
 * which catch `unknown` types in TypeScript.
 * 
 * @param error - The error value (unknown type from catch clause).
 * @returns A string representation of the error message.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return String(error);
}

/**
 * Creates a validation error with a custom error code.
 * 
 * This function is used throughout the CLI to create errors with specific exit codes
 * for validation failures and invalid arguments.
 * 
 * @param message - The error message to associate with the error.
 * @param code - The numeric error code indicating the exit or validation type.
 * @returns An Error object with the specified message and an added 'code' property.
 */
export function createValidationError(message: string, code: number): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

/**
 * Reads a JSON file from the given path, validates its existence and file type, parses its contents,
 * and returns the parsed object. Throws a validation error with an appropriate exit code if the file 
 * does not exist, is not a regular file, or does not contain valid JSON.
 * 
 * @template T The expected return type for the parsed JSON object.
 * @param filePath - The path to the JSON file, relative to the current working directory.
 * @param errorContext - Optional context to include in error messages (e.g., "Debate file", "Config file").
 *                       Defaults to "File" if not provided.
 * @returns The parsed JSON object of type T.
 * @throws {Error} Throws a validation error with a specific exit code if:
 *   - The file does not exist (EXIT_INVALID_ARGS).
 *   - The path is not a file (EXIT_INVALID_ARGS).
 *   - The file contains invalid JSON (EXIT_INVALID_ARGS).
 */
export function readJsonFile<T>(filePath: string, errorContext: string = 'File'): T {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw createValidationError(`${errorContext} not found: ${abs}`, EXIT_INVALID_ARGS);
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw createValidationError(`Path is not a file: ${abs}`, EXIT_INVALID_ARGS);
  }
  const raw = fs.readFileSync(abs, FILE_ENCODING_UTF8);
  try {
    return JSON.parse(raw) as T;
  } catch (parseError: unknown) {
    throw createValidationError(`Invalid JSON format in ${errorContext.toLowerCase()}: ${abs} (${getErrorMessage(parseError)})`, EXIT_INVALID_ARGS);
  }
}

/**
 * Writes content to a file, creating parent directories if needed.
 * Normalizes the path relative to the current working directory and ensures
 * all parent directories exist before writing the file.
 * 
 * @param relativePath - The file path relative to the current working directory.
 * @param content - The content to write to the file.
 * @returns Promise resolving to the absolute path of the file that was written.
 * @throws {Error} Propagates any errors from file system operations (directory creation or file writing).
 */
export async function writeFileWithDirectories(relativePath: string, content: string): Promise<string> {
  // Normalize path relative to current working directory
  const absolutePath = path.resolve(process.cwd(), relativePath);
  
  // Ensure parent directories exist
  const parentDir = path.dirname(absolutePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  
  // Write file with UTF-8 encoding
  await fs.promises.writeFile(absolutePath, content, FILE_ENCODING_UTF8);
  
  return absolutePath;
}

