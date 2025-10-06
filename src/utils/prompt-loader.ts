import fs from 'fs';
import path from 'path';
import { PromptSource, PROMPT_SOURCES } from '../types/agent.types';
import { warnUser } from '../cli/index';

export type PromptResolveResult = PromptSource & { text: string };

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
      warnUser(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      warnUser(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    const raw = fs.readFileSync(abs, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      warnUser(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
      return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
    }
    return { text: raw, source: PROMPT_SOURCES.FILE, absPath: abs };
  } catch (_err) {
    warnUser(`System prompt file not usable for ${label} at ${abs}. Falling back to built-in default.`);
    return { text: defaultText, source: PROMPT_SOURCES.BUILT_IN };
  }
}