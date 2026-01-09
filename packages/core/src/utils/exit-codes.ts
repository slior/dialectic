export const EXIT_SUCCESS = 0;
export const EXIT_GENERAL_ERROR = 1;
export const EXIT_INVALID_ARGS = 2;
export const EXIT_PROVIDER_ERROR = 3;
export const EXIT_CONFIG_ERROR = 4;

/**
 * Type representing an Error object that may have an optional numeric code property.
 * This is commonly used for errors that carry exit codes for CLI error handling.
 */
export type ErrorWithCode = Error & { code?: number };