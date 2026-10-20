import { pino, type DestinationStream, type Logger } from 'pino';

// Keys that may carry credentials; pino replaces them before anything is written.
const REDACTED_PATHS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'jwt',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.jwt',
  '*.authorization',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
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
