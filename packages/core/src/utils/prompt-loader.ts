import fs from 'fs';
import path from 'path';
import { PromptSource, PROMPT_SOURCES } from '../types/agent.types';
import { logWarning } from './console';

export type PromptResolveResult = PromptSource & { text: string };

/**
 * Reads a built-in prompt file with fallback support for different execution contexts.
 * 
 * This function attempts to load a prompt file from the project source directory.
 * It first tries to resolve relative to the compiled dist/ directory (for runtime),
 * then falls back to resolving from the project root src/ directory (for tests).
 * If both attempts fail, it returns the provided fallback text.
 * 
 * @param relativePathFromSrc - Path relative to the src/ directory (e.g., 'eval/prompts/system.md')
 * @param fallbackText - Text to return if the file cannot be read
 * @returns The contents of the prompt file, or the fallback text if unavailable
 */
export function readBuiltInPrompt(relativePathFromSrc: string, fallbackText: string): string {
  try {
    // Primary attempt: resolve from dist/ directory (../../ climbs out of dist/utils/ back to dist/)
    return fs.readFileSync(path.resolve(__dirname, '../../', relativePathFromSrc), 'utf-8');
  } catch (_e1) {
    try {
      // Secondary attempt: resolve from project root src/ directory (useful under ts-jest)
      return fs.readFileSync(path.resolve(process.cwd(), 'src', relativePathFromSrc), 'utf-8');
    } catch (_e2) {
      return fallbackText;
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