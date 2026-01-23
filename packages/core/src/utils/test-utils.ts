import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Creates a temporary directory for testing and returns a cleanup function.
 * Reusable utility for test setup/teardown.
 * 
 * @param prefix - Optional prefix for the temporary directory name (default: 'test-')
 * @returns An object containing the temporary directory path and a cleanup function
 */
export function createTempDir(prefix: string = 'test-'): { tmpDir: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    tmpDir,
    cleanup: (): void => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}
