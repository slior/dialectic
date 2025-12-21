import { logInfo, logSuccess, logWarning } from './console';

export class Logger {
  constructor(private verbose: boolean = false) {}

  info(message: string): void {
    logInfo(message);
  }

  success(message: string): void {
    logSuccess(message);
  }

  warn(message: string): void {
    logWarning(message);
  }

  error(message: string): void {
    logWarning(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      logInfo(message);
    }
  }

  agentAction(agentName: string, action: string): void {
    console.log(`[${agentName}] ${action}`);
  }

  separator(): void {
    console.log('━'.repeat(60));
  }
}
