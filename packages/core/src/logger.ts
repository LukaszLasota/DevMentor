import { pino, type DestinationStream, type Logger } from 'pino';

// Keys that may carry credentials (passwords, tokens, OAuth `code`, cookies, auth headers);
// pino replaces them at the top level and one level deep before anything is written.
const SENSITIVE_KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'jwt', 'code', 'cookie', 'authorization'];
// Bracket notation: pino (fast-redact) cannot address `set-cookie` with a dot path.
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie'];

const REDACTED_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_HEADERS.map((header) => `headers["${header}"]`),
  ...SENSITIVE_HEADERS.map((header) => `*.headers["${header}"]`),
  // Listed only so pino gives `err` its own redactor: the censor then sees the real path
  // (`['err', 'code']`; wildcard matches report a symbol instead of the key) and keeps it.
  'err.code',
];

/**
 * `err.code` of a logged error is an error code (Postgres `23505`, `ECONNRESET`, our `AppError`
 * codes), not a credential: keep it, while an OAuth `code` anywhere else is still redacted.
 */
function censor(value: unknown, path: string[]): unknown {
  return path.length === 2 && path[0] === 'err' && path[1] === 'code' ? value : '[REDACTED]';
}

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      // Read LOG_LEVEL directly (not via getEnv) so logging works even when env validation fails.
      level: process.env.LOG_LEVEL ?? 'info',
      base: { app: 'devmentor' },
      redact: { paths: REDACTED_PATHS, censor },
    },
    destination,
  );
}

export const logger: Logger = createLogger();

export type { Logger };
