import fs from 'fs';
import path from 'path';
import { writeStderr } from './console';
import dotenv from 'dotenv';

// Constants for environment file loading
const DEFAULT_ENV_FILENAME = '.env';
const ERROR_ENV_FILE_NOT_FOUND = 'Environment file not found';
const WARN_DEFAULT_ENV_MISSING = 'No .env file found at';
const ERROR_ENV_FILE_LOAD_FAILED = 'Failed to load environment file';

/**
 * Loads environment variables from a .env file using the dotenv library.
 * 
 * By default, attempts to load '.env' from the current working directory.
 * If the default .env file doesn't exist, continues silently (non-breaking).
 * If a custom env file path is specified and doesn't exist, throws an error.
 * In verbose mode, warns about missing default .env files to stderr.
 *
 * @param envFilePath - Optional path to a custom .env file, relative to process.cwd()
 * @param verbose - Whether to output verbose logging about .env file loading
 * @throws {Error} If explicitly specified env file doesn't exist or dotenv parsing fails
 */
export function loadEnvironmentFile(envFilePath?: string, verbose?: boolean): void {
  const fileName = envFilePath || DEFAULT_ENV_FILENAME;
  const baseDir = process.env.INIT_CWD || process.cwd();
  const resolvedPath = path.resolve(baseDir, fileName);
  const isDefaultFile = !envFilePath;

  if (!fs.existsSync(resolvedPath)) {
    if (isDefaultFile) { // Silent failure for default .env file, with optional verbose warning
      
      if (verbose === true) {
        writeStderr(`${WARN_DEFAULT_ENV_MISSING} ${resolvedPath}. Continuing without loading environment variables.\n`);
      }
      return;
    } else { // Error for explicitly specified env file
      throw new Error(`${ERROR_ENV_FILE_NOT_FOUND}: ${resolvedPath}`);
    }
  }
  
  const result = dotenv.config({ path: resolvedPath });
  
  if (result.error) {
    throw new Error(`${ERROR_ENV_FILE_LOAD_FAILED}: ${result.error.message}`);
  }
}