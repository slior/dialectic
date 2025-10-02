// Lazy optional chalk import to avoid ESM issues in test environment
let chalk: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  chalk = require('chalk');
} catch {
  chalk = null;
}

function color(method: string, message: string): string {
  return chalk && chalk[method] ? chalk[method](message) : message;
}

export class Logger {
  constructor(private verbose: boolean = false) {}

  info(message: string): void {
    console.log(color('cyan', message));
  }

  success(message: string): void {
    console.log(color('green', message));
  }

  warn(message: string): void {
    console.warn(color('yellow', message));
  }

  error(message: string): void {
    console.error(color('red', message));
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(color('gray', message));
    }
  }

  agentAction(agentName: string, action: string): void {
    console.log(`[${agentName}] ${action}`);
  }

  separator(): void {
    console.log('━'.repeat(60));
  }
}
