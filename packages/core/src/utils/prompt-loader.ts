import fs from 'fs';
import path from 'path';

import { PromptSource, PROMPT_SOURCES } from '../types/agent.types';

import { logWarning } from './console';

export type PromptResolveResult = PromptSource & { text: string };

/**
 * Reads a built-in prompt file with fallback support for different execution contexts.
 * 
 * This function attempts to load a prompt file using multiple path resolution strategies:
 * 1. From dist/ directory (when running from compiled code)
 * 2. From packages/core/src/ found by traversing up from __dirname to workspace root
 * 3. From packages/core/src/ found by traversing up from process.cwd() to workspace root
 * 
 * This handles various execution contexts:
 * - Compiled code running from dist/
 * - Development mode with ts-node from workspace root
 * - Development mode with ts-node from CLI package directory
 * 
 * If all attempts fail, it returns the provided fallback text.
 * 
 * @param relativePathFromSrc - Path relative to the src/ directory (e.g., 'eval/prompts/system.md')
 * @param fallbackText - Text to return if the file cannot be read
 * @returns The contents of the prompt file, or the fallback text if unavailable
 */
export function readBuiltInPrompt(relativePathFromSrc: string, fallbackText: string): string {
  // Attempt 1: From dist/ directory (when running from compiled code)
  // __dirname is packages/core/dist/utils, so ../../ goes to packages/core/dist, then add relativePathFromSrc
  const attempt1Path = path.resolve(__dirname, '../../', relativePathFromSrc);
  
  // Attempt 2: From packages/core/src/ directory (when running from source with ts-node from workspace root)
  // Find workspace root by going up from __dirname until we find packages/core
  let workspaceRoot = __dirname;
  while (workspaceRoot !== path.dirname(workspaceRoot)) {
    const coreDir = path.join(workspaceRoot, 'packages', 'core');
    if (fs.existsSync(coreDir)) {
      break;
    }
    workspaceRoot = path.dirname(workspaceRoot);
  }
  const attempt2Path = path.resolve(workspaceRoot, 'packages', 'core', 'src', relativePathFromSrc);
  
  // Attempt 3: From packages/core/src/ relative to process.cwd() (when running from CLI package)
  // Go up from cwd until we find packages/core
  let cwdRoot = process.cwd();
  while (cwdRoot !== path.dirname(cwdRoot)) {
    const coreDir = path.join(cwdRoot, 'packages', 'core');
    if (fs.existsSync(coreDir)) {
      break;
    }
    cwdRoot = path.dirname(cwdRoot);
  }
  const attempt3Path = path.resolve(cwdRoot, 'packages', 'core', 'src', relativePathFromSrc);
  
  try {
    // Primary attempt: resolve from dist/ directory (../../ climbs out of dist/utils/ back to dist/)
    return fs.readFileSync(attempt1Path, 'utf-8');
  } catch (_e1) {
    try {
      // Secondary attempt: resolve from packages/core/src/ found via __dirname traversal
      return fs.readFileSync(attempt2Path, 'utf-8');
    } catch (_e2) {
      try {
        // Tertiary attempt: resolve from packages/core/src/ found via process.cwd() traversal
        return fs.readFileSync(attempt3Path, 'utf-8');
      } catch (_e3) {
        return fallbackText;
      }
    }
  }
}

/**
 * Resolves the system prompt text for an agent or judge, either from a specified file or from a built-in default.
 *
 * This function attempts to load a system prompt from a file path if provided. If the file is missing, unreadable,
 * not a file, or empty (after trimming), it will warn the user and fall back to the provided default text.
 * Relative file paths are resolved against the given configuration directory.
 *
 * @param params - An object containing:
 *   - label:      A human-readable label for the agent/judge (used in warning messages).
 *   - configDir:  The directory to resolve relative prompt file paths against.
 *   - promptPath: (Optional) The path to the prompt file (absolute or relative to configDir).
 *   - defaultText:The default prompt text to use if the file is not usable.
 *
 * @returns An object containing:
 *   - text:    The resolved prompt text (from file or default).
 *   - source:  The source of the prompt ('file' or 'built-in').
 *   - absPath: (If source is 'file') The absolute path to the prompt file.
 */
export function resolvePrompt(params: { label: string; configDir: string; promptPath?: string; defaultText: string }): PromptResolveResult {
  const { label, configDir, promptPath, defaultText } = params;
  if (!promptPath || String(promptPath).trim().length === 0) {
    return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
  }
  const abs = path.isAbsolute(promptPath) ? promptPath : path.resolve(configDir, promptPath);
  try {
    if (!fs.existsSync(abs)) {
      logWarning(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      logWarning(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    const raw = fs.readFileSync(abs, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      logWarning(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    return { text: raw, source: PROMPT_SOURCES.FILE, absPath: abs };
  } catch (_err) {
    logWarning(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
    return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
  }
}