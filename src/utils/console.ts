/**
 * Outputs a diagnostic/verbose message to stderr without coloring.
 * Used for structured diagnostic output that should not interfere with stdout piping.
 * 
 * This utility is separated from the CLI module to avoid circular dependencies
 * when used in core modules like Agent.
 * 
 * @param message - The message to write to stderr.
 */
export function writeStderr(message: string): void {
  process.stderr.write(message);
}

