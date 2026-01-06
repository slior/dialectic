#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { debateCommand, loadConfig as loadDebateConfig } from './commands/debate';
import { evalCommand } from './commands/eval';
import { reportCommand } from './commands/report';
import { EXIT_GENERAL_ERROR, logInfo, logWarning } from 'dialectic-core';

export const PROGRAM_NAME = 'dialectic';

/**
 * Outputs a warning message to stderr with unified formatting.
 * Used for user-facing warnings throughout the CLI.
 */
export function warnUser(message: string): void {
  logWarning(message);
}

/**
 * Outputs an info message to stderr with unified formatting.
 * Used for user-facing informational messages throughout the CLI.
 */
export function infoUser(message: string): void {
  logInfo(message);
}

/**
 * Gets the package version from package.json.
 * Works in both published packages and development/linked scenarios.
 * 
 * @returns The version string from package.json, or 'unknown' if not found.
 */
function getPackageVersion(): string {
  try {
    // When compiled: __dirname is dist/, so ../package.json is correct
    // When published: __dirname is node_modules/dialectic/dist/, so ../package.json works
    // When linked: same as published
    const packageJsonPath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    // Fallback for edge cases (shouldn't happen in normal usage)
    return 'unknown';
  }
}

/**
 * Runs the CLI for the multi-agent debate system.
 *
 * This function sets up the command-line interface using Commander,
 * registers available commands (such as 'debate'), and parses the provided arguments.
 * It is intended to be called with the argument vector (argv) excluding the node and script name.
 *
 * @param argv - The array of command-line arguments to parse (excluding 'node' and script name).
 * @throws Any error encountered during command parsing.
 */
export async function runCli(argv: string[]) {
  const program = new Command();
  program.name(PROGRAM_NAME).description('Multi-agent debate system').version(getPackageVersion());

  // Register commands
  debateCommand(program);
  evalCommand(program);
  reportCommand(program);

  await program.parseAsync(['node', PROGRAM_NAME, ...argv]);
}

// If called directly from node
if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err: unknown) => {
    // Map generic error when not already code-tagged
    const code = (err && typeof err === 'object' && 'code' in err && typeof err.code === 'number') ? err.code : EXIT_GENERAL_ERROR;
    const msg = (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') ? err.message : 'Unknown error';
    process.stderr.write(msg + '\n');
    process.exit(code);
  });
}

// Re-export config loader for tests
export const loadConfig = loadDebateConfig;

// Export CLI utilities for tests
export { DebateProgressUI } from './utils/progress-ui';