#!/usr/bin/env node
import { Command } from 'commander';
import { debateCommand, loadConfig as loadDebateConfig } from './commands/debate';
import { EXIT_GENERAL_ERROR } from '../utils/exit-codes';

export async function runCli(argv: string[]) {
  const program = new Command();
  program.name('debate').description('Multi-agent debate system').version('1.0.0');

  // Register commands
  debateCommand(program);

  try {
    await program.parseAsync(['node', 'debate', ...argv]);
  } catch (err: any) {
    throw err;
  }
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
