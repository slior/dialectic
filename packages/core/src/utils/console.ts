// Lazy load chalk for optional color support
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  // If chalk is not available, create a pass-through mock
  chalk = new Proxy({}, {
    get: (): ((text: string) => string) => (text: string) => text
  });
}

// Message type enum for categorizing messages
export enum MessageType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning'
}

// Message icon constants
// Exported for testing purposes only - allows tests to reference icons without hardcoding values
export const MESSAGE_ICONS = {
  INFO: 'ℹ',
  SUCCESS: '✓',
  WARNING: '⚠'
} as const;

// Message format configuration
interface MessageFormat {
  icon: string;
  color: (text: string) => string;
}

const MESSAGE_FORMATS: Record<MessageType, MessageFormat> = {
  [MessageType.INFO]: { icon: MESSAGE_ICONS.INFO, color: chalk.blueBright },
  [MessageType.SUCCESS]: { icon: MESSAGE_ICONS.SUCCESS, color: chalk.greenBright },
  [MessageType.WARNING]: { icon: MESSAGE_ICONS.WARNING, color: chalk.yellowBright }
};

const ICON_SPACING = '  '; // Two spaces after icon

/**
 * Formats a message with the appropriate icon and color based on message type.
 * Icon is colored, text remains in default terminal color.
 * 
 * @param message - The message text to format.
 * @param type - The message type (info, success, or warning).
 * @returns Formatted message string with colored icon, spacing, and plain text.
 */
function formatMessage(message: string, type: MessageType): string {
  const format = MESSAGE_FORMATS[type];
  const coloredIcon = format.color(format.icon);
  return `${coloredIcon}${ICON_SPACING}${message}`;
}

/**
 * Outputs an info message to stderr with unified formatting (icon + colored icon).
 * Used for informational messages throughout the application.
 * 
 * @param message - The message text to log.
 */
export function logInfo(message: string): void {
  const formatted = formatMessage(message, MessageType.INFO);
  console.error(formatted);
}

/**
 * Outputs a success message to stderr with unified formatting (icon + colored icon).
 * Used for success/completion messages throughout the application.
 * 
 * @param message - The message text to log.
 */
export function logSuccess(message: string): void {
  const formatted = formatMessage(message, MessageType.SUCCESS);
  console.error(formatted);
}

/**
 * Outputs a warning message to stderr with unified formatting (icon + colored icon).
 * Used for warning messages throughout the application.
 * 
 * @param message - The message text to log.
 */
export function logWarning(message: string): void {
  const formatted = formatMessage(message, MessageType.WARNING);
  console.error(formatted);
}

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

