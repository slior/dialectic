/**
 * Parses CORS origins from environment variable.
 * 
 * Reads the `CORS_ORIGINS` environment variable and parses it as a comma-separated
 * list of allowed origins. If the variable is not set, defaults to localhost origins
 * suitable for local development.
 * 
 * @returns Array of allowed CORS origin strings, trimmed and filtered of empty values.
 * 
 * @example
 * // With CORS_ORIGINS="http://localhost:3000,https://app.example.com"
 * const origins = getCorsOrigins();
 * // Returns: ['http://localhost:3000', 'https://app.example.com']
 * 
 * @example
 * // Without CORS_ORIGINS set
 * const origins = getCorsOrigins();
 * // Returns: ['http://localhost:3000', 'http://127.0.0.1:3000']
 */
export function getCorsOrigins(): string[] {
  const corsOriginsEnv = process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
  return corsOriginsEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

