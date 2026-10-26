import { pino, type DestinationStream, type Logger } from 'pino';

// Keys that may carry credentials (passwords, tokens, OAuth `code`, cookies, auth headers);
// pino replaces them at the top level and one level deep before anything is written.
// Note: `*.code` also hides `err.code` of logged errors — accepted, an OAuth code must never leak.
const SENSITIVE_KEYS = ['password', 'token', 'accessToken', 'refreshToken', 'jwt', 'code', 'cookie', 'authorization'];
// Bracket notation: pino (fast-redact) cannot address `set-cookie` with a dot path.
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie'];

const REDACTED_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_HEADERS.map((header) => `headers["${header}"]`),
  ...SENSITIVE_HEADERS.map((header) => `*.headers["${header}"]`),
];

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      // Read LOG_LEVEL directly (not via getEnv) so logging works even when env validation fails.
      level: process.env.LOG_LEVEL ?? 'info',
      base: { app: 'devmentor' },
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    },
    destination,
  );
}

export const logger: Logger = createLogger();

export type { Logger };
