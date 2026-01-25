import fs from 'fs';
import os from 'os';

import { isPathWithinDirectory } from './path-security';

// Mock fs.realpathSync to control symlink resolution
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  realpathSync: jest.fn((p: fs.PathLike) => String(p)),
}));

describe('isPathWithinDirectory', () => {
  const mockRealpathSync = fs.realpathSync as jest.MockedFunction<typeof fs.realpathSync>;

  beforeEach(() => {
    mockRealpathSync.mockImplementation((p: fs.PathLike) => String(p));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('basic path validation', () => {
    it('should return true for a file within the context directory', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/src/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should return true for a relative path within the context directory', () => {
      const contextDir = '/home/user/project';
      const targetPath = 'src/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should return true for a nested directory within the context directory', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/src/utils/helper.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should return true for the same directory', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should return true for a file in a deeply nested subdirectory', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/a/b/c/d/e/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });
  });

  describe('path traversal prevention', () => {
    it('should return false for a path with .. traversal', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/../other/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });

    it('should return false for a relative path with .. traversal', () => {
      const contextDir = '/home/user/project';
      const targetPath = '../other/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });

    it('should return false for a path with multiple .. traversals', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/../../etc/passwd';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });

    it('should return false for a path outside the context directory', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/other/file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });

    it('should return false for an absolute path on a different drive (Windows)', () => {
      if (os.platform() === 'win32') {
        const contextDir = 'C:\\Users\\user\\project';
        const targetPath = 'D:\\other\\file.ts';
        
        expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
      }
    });
  });

  describe('symlink handling', () => {
    it('should resolve symlinks before comparison', () => {
      const contextDir = '/home/user/project';
      const symlinkPath = '/home/user/project/symlink';
      const realPath = '/home/user/other/file.ts';
      
      // Mock symlink resolution: symlink resolves to a path outside context
      // The function calls realpathSync on both resolvedTarget and resolvedContext
      mockRealpathSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === symlinkPath || pathStr.includes('symlink')) {
          return realPath;
        }
        return pathStr;
      });
      
      expect(isPathWithinDirectory(symlinkPath, contextDir)).toBe(false);
    });

    it('should allow symlinks that resolve within the context directory', () => {
      const contextDir = '/home/user/project';
      const symlinkPath = '/home/user/project/symlink';
      const realPath = '/home/user/project/src/file.ts';
      
      // Mock symlink resolution: symlink resolves to a path within context
      // The function calls realpathSync on both resolvedTarget and resolvedContext
      mockRealpathSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === symlinkPath || pathStr.includes('symlink')) {
          return realPath;
        }
        return pathStr;
      });
      
      expect(isPathWithinDirectory(symlinkPath, contextDir)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string target path', () => {
      const contextDir = '/home/user/project';
      const targetPath = '';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should handle paths with trailing slashes', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/src/';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should return false when path resolution fails', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/nonexistent/path';
      
      // Mock realpathSync to throw an error
      mockRealpathSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });

    it('should return false when context directory resolution fails', () => {
      const contextDir = '/nonexistent/context';
      const targetPath = '/home/user/project/file.ts';
      
      // Mock realpathSync to throw an error for context directory
      mockRealpathSync.mockImplementation((p: fs.PathLike) => {
        if (String(p).includes('nonexistent')) {
          throw new Error('ENOENT');
        }
        return String(p);
      });
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
    });
  });

  describe('Windows-specific paths', () => {
    const isWindows = os.platform() === 'win32';

    if (isWindows) {
      it('should handle Windows drive letters correctly', () => {
        const contextDir = 'C:\\Users\\user\\project';
        const targetPath = 'C:\\Users\\user\\project\\src\\file.ts';
        
        expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
      });

      it('should reject paths on different drives', () => {
        const contextDir = 'C:\\Users\\user\\project';
        const targetPath = 'D:\\other\\file.ts';
        
        expect(isPathWithinDirectory(targetPath, contextDir)).toBe(false);
      });

      it('should handle UNC paths', () => {
        const contextDir = '\\\\server\\share\\project';
        const targetPath = '\\\\server\\share\\project\\src\\file.ts';
        
        expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
      });
    }
  });

  describe('normalization', () => {
    it('should normalize path separators', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project/src/utils/../file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });

    it('should handle redundant separators', () => {
      const contextDir = '/home/user/project';
      const targetPath = '/home/user/project//src//file.ts';
      
      expect(isPathWithinDirectory(targetPath, contextDir)).toBe(true);
    });
  });
});
