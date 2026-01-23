import fs from 'fs';
import os from 'os';

import { createTempDir } from './test-utils';

describe('test-utils', () => {
  describe('createTempDir', () => {
    it('should create a temporary directory with default prefix', () => {
      const { tmpDir, cleanup } = createTempDir();
      
      expect(tmpDir).toBeDefined();
      expect(tmpDir).toContain(os.tmpdir());
      expect(tmpDir).toContain('test-');
      expect(fs.existsSync(tmpDir)).toBe(true);
      expect(typeof cleanup).toBe('function');
      
      // Cleanup
      cleanup();
      expect(fs.existsSync(tmpDir)).toBe(false);
    });

    it('should create a temporary directory with custom prefix', () => {
      const customPrefix = 'my-custom-test-';
      const { tmpDir, cleanup } = createTempDir(customPrefix);
      
      expect(tmpDir).toBeDefined();
      expect(tmpDir).toContain(os.tmpdir());
      expect(tmpDir).toContain(customPrefix);
      expect(fs.existsSync(tmpDir)).toBe(true);
      
      // Cleanup
      cleanup();
      expect(fs.existsSync(tmpDir)).toBe(false);
    });

    it('should return a cleanup function that removes the directory', () => {
      const { tmpDir, cleanup } = createTempDir();
      
      // Verify directory exists
      expect(fs.existsSync(tmpDir)).toBe(true);
      
      // Call cleanup
      cleanup();
      
      // Verify directory is removed
      expect(fs.existsSync(tmpDir)).toBe(false);
    });

    it('should handle cleanup errors gracefully', () => {
      const { tmpDir, cleanup } = createTempDir();
      
      // Manually remove the directory first
      fs.rmSync(tmpDir, { recursive: true, force: true });
      
      // Cleanup should not throw even if directory doesn't exist
      expect(() => cleanup()).not.toThrow();
    });

    it('should create unique temporary directories on each call', () => {
      const { tmpDir: tmpDir1, cleanup: cleanup1 } = createTempDir();
      const { tmpDir: tmpDir2, cleanup: cleanup2 } = createTempDir();
      
      expect(tmpDir1).not.toBe(tmpDir2);
      expect(fs.existsSync(tmpDir1)).toBe(true);
      expect(fs.existsSync(tmpDir2)).toBe(true);
      
      // Cleanup
      cleanup1();
      cleanup2();
    });

    it('should work with empty prefix', () => {
      const { tmpDir, cleanup } = createTempDir('');
      
      expect(tmpDir).toBeDefined();
      expect(tmpDir).toContain(os.tmpdir());
      expect(fs.existsSync(tmpDir)).toBe(true);
      
      // Cleanup
      cleanup();
      expect(fs.existsSync(tmpDir)).toBe(false);
    });
  });
});
