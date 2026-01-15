import fs from 'fs';
import path from 'path';

/**
 * Checks if a target path is within the allowed context directory.
 * Prevents path traversal attacks by resolving paths and comparing.
 * 
 * Both paths are resolved to absolute paths and normalized. Symlinks are resolved
 * to their real paths before comparison to prevent symlink-based attacks.
 * 
 * @param targetPath - The path to validate (can be relative or absolute).
 * @param baseDirectory - The allowed base directory (should be absolute).
 * @returns true if path is within context directory, false otherwise.
 */
export function isPathWithinDirectory(targetPath: string, baseDirectory: string): boolean {
  try {
    // Resolve both paths to absolute paths
    const resolvedTarget = path.resolve(baseDirectory, targetPath);
    const resolvedContext = path.resolve(baseDirectory);

    // Resolve symlinks to their real paths for security
    // If target path doesn't exist, we can't resolve its symlinks, but we can still check
    // if the resolved path structure is within the context directory
    let realTarget: string;
    try {
      realTarget = fs.realpathSync(resolvedTarget);
    } catch {
      // Path doesn't exist or can't be resolved - use resolved path for validation
      // This allows checking paths that don't exist yet (e.g., new files)
      realTarget = resolvedTarget;
    }

    // Always resolve context directory symlinks to prevent symlink attacks on the context itself
    const realContext = fs.realpathSync(resolvedContext);

    // Normalize paths to handle different separators
    const normalizedTarget = path.normalize(realTarget);
    const normalizedContext = path.normalize(realContext);

    // Use path.relative to check if target is a descendant of context
    // If relative path starts with '..' or is absolute, it's outside
    const relativePath = path.relative(normalizedContext, normalizedTarget);
    
    // Check if the relative path indicates the target is outside the context
    // - Starts with '..' means going up directories (outside)
    // - Is absolute path (shouldn't happen after relative, but check for safety)
    // - Empty string means same directory (allowed)
    // - Otherwise, it's a relative path within the context (allowed)
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  } catch (error: unknown) {
    // If any error occurs (e.g., context directory doesn't exist, permission denied),
    // fail securely by returning false
    return false;
  }
}
