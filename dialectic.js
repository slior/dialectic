#!/usr/bin/env node
const { runCli } = require('./dist/cli/index.js');
const { EXIT_GENERAL_ERROR } = require('./dist/utils/exit-codes.js');

runCli(process.argv.slice(2)).catch((err) => {
  const code = typeof err?.code === 'number' ? err.code : EXIT_GENERAL_ERROR;
  const msg = err?.message || 'Unknown error';
  process.stderr.write(msg + '\n');
  process.exit(code);
});
