#!/usr/bin/env node
import { Command } from 'commander';
import { debateCommand, loadConfig as loadDebateConfig } from './commands/debate';
import { EXIT_GENERAL_ERROR } from '../utils/exit-codes';

// Color constants for CLI output
export const WARNING_COLOR = 'yellow';
export const INFO_COLOR = 'gray';

// Lazy optional chalk import for colored output
let chalk: any;
try { chalk = require('chalk'); } catch { chalk = null; }

function color(method: string, msg: string): string {
  return chalk && chalk[method] ? chalk[method](msg) : msg;
}

/**
 * Outputs a warning message to stderr with consistent formatting.
 * Used for user-facing warnings throughout the CLI.
 */
export function warnUser(message: string): void {
  process.stderr.write(color(WARNING_COLOR, message) + '\n');
}

/**
 * Outputs an info message to stderr with consistent formatting.
 * Used for user-facing informational messages throughout the CLI.
 */
export function infoUser(message: string): void {
  process.stderr.write(color(INFO_COLOR, message) + '\n');
}

/**
 * Outputs a diagnostic/verbose message to stderr without coloring.
 * Used for structured diagnostic output that should not interfere with stdout piping.
 */
export function writeStderr(message: string): void {
  process.stderr.write(message);
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
  program.name('debate').description('Multi-agent debate system').version('0.1.0');

  // Register commands
  debateCommand(program);

  await program.parseAsync(['node', 'debate', ...argv]);
}

// If called directly from node
if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err: any) => {
    // Map generic error when not already code-tagged
    const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
    const msg = err?.message || 'Unknown error';
    process.stderr.write(msg + '\n');
    process.exit(code);
  });
}

// Re-export config loader for tests
export const loadConfig = loadDebateConfig;
