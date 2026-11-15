import { randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { ServiceUnavailableError } from '../http/errors';

/** scrypt cost parameters; stored with every hash, so they can change without breaking old ones. */
export interface ScryptParams {
  /** log2 of the CPU/memory cost N. */
  readonly logN: number;
  /** Block size r. */
  readonly r: number;
  /** Parallelization p. */
  readonly p: number;
}

/** Production cost: N = 2^17, r = 8, p = 1 (OWASP's scrypt recommendation, ~128 MiB per hash). */
export const SCRYPT_LOG_N = 17;
export const SCRYPT_BLOCK_SIZE = 8;
export const SCRYPT_PARALLELIZATION = 1;
export const PASSWORD_SCRYPT_PARAMS: ScryptParams = {
  logN: SCRYPT_LOG_N,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELIZATION,
};

export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_KEY_BYTES = 32;
/** Bounds for parameters read back from a stored hash, so a bad row cannot exhaust memory or CPU. */
const MAX_SCRYPT_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_P = 4;
const MIN_STORED_BYTES = 16;

/**
 * Stored format: `$scrypt$ln=<logN>,r=<r>,p=<p>$<salt base64>$<key base64>` (PHC string style).
 * Self-describing, so `verifyPassword` uses the parameters a hash was made with.
 */
const STORED_HASH = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

/** Memory scrypt needs: 128 · N · r bytes (128 MiB for the production cost). */
function scryptMemory({ logN, r }: ScryptParams): number {
  return 128 * 2 ** logN * r;
}

/** Node refuses scrypt above `maxmem` (default 32 MiB): set it explicitly, with headroom. */
export function scryptMaxmem(params: ScryptParams): number {
  return 2 * scryptMemory(params);
}

const scryptAsync = promisify(scrypt) as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Unicode passwords are NFKC-normalized, so the same characters typed differently still match. */
function derive(password: string, salt: Buffer, params: ScryptParams, keyBytes: number): Promise<Buffer> {
  return scryptAsync(password.normalize('NFKC'), salt, keyBytes, {
    N: 2 ** params.logN,
    r: params.r,
    p: params.p,
    maxmem: scryptMaxmem(params),
  });
}

/** Hashes a password with a fresh random salt; returns the self-describing stored string. */
export async function hashPassword(password: string, params: ScryptParams = PASSWORD_SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await derive(password, salt, params, SCRYPT_KEY_BYTES);

  return `$scrypt$ln=${params.logN},r=${params.r},p=${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

function parseStoredHash(stored: string): ParsedHash | undefined {
  const match = STORED_HASH.exec(stored);

  if (match === null) {
    return undefined;
  }

  const [, logN, r, p, saltBase64, keyBase64] = match;
  const params = { logN: Number(logN), r: Number(r), p: Number(p) };
  const salt = Buffer.from(saltBase64, 'base64');
  const key = Buffer.from(keyBase64, 'base64');
  const valid = [
    params.logN >= 1 && params.r >= 1 && scryptMemory(params) <= MAX_SCRYPT_MEMORY_BYTES,
    params.p >= 1 && params.p <= MAX_P,
    // A short key would make the comparison meaningless (an empty key matches any password).
    salt.length >= MIN_STORED_BYTES && key.length >= MIN_STORED_BYTES,
  ].every(Boolean);

  return valid ? { params, salt, key } : undefined;
}

/**
 * Checks a password against a stored hash in constant time. A malformed stored value is an error
 * (a corrupt row must not silently refuse every sign-in). Unknown users go through
 * `PasswordHasher.verify(password, null)`, which runs the same work against a dummy hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);

  if (parsed === undefined) {
    throw new Error('Stored password hash has an unknown format');
  }

  const key = await derive(password, parsed.salt, parsed.params, parsed.key.length);

  return timingSafeEqual(key, parsed.key);
}

export interface HashingGateOptions {
  /** Concurrent hashes (`PASSWORD_HASH_CONCURRENCY`). */
  concurrency: number;
  /** How long a caller waits for a free slot before a 503 (`PASSWORD_HASH_WAIT_MS`). */
  waitMs: number;
}

/**
 * Process-wide semaphore around scrypt: each hash takes ~128 MiB and a libuv thread, so a burst of
 * sign-ins queues here instead of exhausting memory. A caller that waits longer than `waitMs`
 * gets `ServiceUnavailableError` (503).
 */
export class HashingGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly options: HashingGateOptions) {}

  /** Runs `fn` while holding one slot; the slot is released when `fn` settles. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.options.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(grant), 1);
        reject(new ServiceUnavailableError('The service is busy. Try again in a moment.'));
      }, this.options.waitMs);

      this.waiting.push(grant);
    });
  }

  /** Hands the slot straight to the next waiter, or frees it. */
  private release(): void {
    const next = this.waiting.shift();

    if (next) {
      next();
    } else {
      this.active -= 1;
    }
  }
}

/** Hashing operations, only reachable while a gate slot is held (`PasswordHasher.withSlot`). */
export interface SlotHashing {
  hash(password: string): Promise<string>;
  /**
   * `stored === null` (unknown user, or an account without a password) runs scrypt against a fixed
   * dummy hash and returns `false`, so the response time does not reveal whether the account exists.
   */
  verify(password: string, stored: string | null): Promise<boolean>;
}

export interface PasswordHasherOptions extends HashingGateOptions {
  /** Production uses `PASSWORD_SCRYPT_PARAMS`; tests lower the cost to stay fast. */
  params?: ScryptParams;
}

/**
 * Password hashing behind the global concurrency gate (container singleton `passwordHasher`).
 * Routes take the slot first, then consume the rate limit, then hash (`guardPasswordAttempt` in
 * `rate-limit.ts`), so a saturated gate answers 503 without counting the attempt.
 */
export class PasswordHasher {
  readonly params: ScryptParams;
  private readonly gate: HashingGate;
  private dummyHash: Promise<string> | undefined;

  constructor({ params = PASSWORD_SCRYPT_PARAMS, ...gate }: PasswordHasherOptions) {
    this.params = params;
    this.gate = new HashingGate(gate);
  }

  /** Runs `fn` with hashing operations while holding one gate slot; 503 when none frees up in time. */
  withSlot<T>(fn: (hashing: SlotHashing) => Promise<T>): Promise<T> {
    return this.gate.run(() =>
      fn({
        hash: (password) => hashPassword(password, this.params),
        verify: (password, stored) => this.verify(password, stored),
      }),
    );
  }

  private async verify(password: string, stored: string | null): Promise<boolean> {
    if (stored !== null) {
      return verifyPassword(password, stored);
    }

    // Made once per process with this hasher's parameters, so the unknown-user path costs the same.
    this.dummyHash ??= hashPassword(randomBytes(SCRYPT_SALT_BYTES).toString('base64'), this.params);
    await verifyPassword(password, await this.dummyHash);

    return false;
  }
}
