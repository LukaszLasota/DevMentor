import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppError, ServiceUnavailableError } from '../http/errors';
import {
  hashPassword,
  HashingGate,
  PASSWORD_SCRYPT_PARAMS,
  PasswordHasher,
  SCRYPT_BLOCK_SIZE,
  SCRYPT_KEY_BYTES,
  SCRYPT_LOG_N,
  SCRYPT_PARALLELIZATION,
  SCRYPT_SALT_BYTES,
  scryptMaxmem,
  verifyPassword,
} from './password';

/** Cheap cost for tests; production uses PASSWORD_SCRYPT_PARAMS (asserted below and in the container test). */
const FAST = { logN: 4, r: 8, p: 1 };
const STORED = /^\$scrypt\$ln=4,r=8,p=1\$([A-Za-z0-9+/]+=*)\$([A-Za-z0-9+/]+=*)$/;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('scrypt parameters', () => {
  it('uses N = 2^17, r = 8, p = 1 in production', () => {
    expect([SCRYPT_LOG_N, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION]).toEqual([17, 8, 1]);
    expect(PASSWORD_SCRYPT_PARAMS).toEqual({ logN: 17, r: 8, p: 1 });
  });

  it('raises maxmem above the 128 · N · r bytes scrypt needs', () => {
    expect(scryptMaxmem(PASSWORD_SCRYPT_PARAMS)).toBe(256 * 1024 * 1024);
    expect(scryptMaxmem(PASSWORD_SCRYPT_PARAMS)).toBeGreaterThan(128 * 2 ** 17 * 8);
  });

  it('hashes and verifies with the real production cost (maxmem is enough)', async () => {
    const stored = await hashPassword('correct horse battery staple');

    expect(stored.startsWith('$scrypt$ln=17,r=8,p=1$')).toBe(true);
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  }, 20_000);
});

describe('hashPassword / verifyPassword', () => {
  it('stores the parameters, a 16-byte salt and a 32-byte key', async () => {
    const stored = await hashPassword('s3cret-password', FAST);
    const [, salt, key] = STORED.exec(stored) ?? [];

    expect(Buffer.from(salt, 'base64')).toHaveLength(SCRYPT_SALT_BYTES);
    expect(Buffer.from(key, 'base64')).toHaveLength(SCRYPT_KEY_BYTES);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same', FAST)).not.toBe(await hashPassword('same', FAST));
  });

  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('s3cret-password', FAST);

    await expect(verifyPassword('s3cret-password', stored)).resolves.toBe(true);
    await expect(verifyPassword('s3cret-passwore', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('verifies with the parameters stored in the hash, so the cost can change later', async () => {
    const stored = await hashPassword('old-cost', { logN: 5, r: 4, p: 2 });

    expect(stored.startsWith('$scrypt$ln=5,r=4,p=2$')).toBe(true);
    await expect(verifyPassword('old-cost', stored)).resolves.toBe(true);
  });

  it('NFKC-normalizes the password', async () => {
    const stored = await hashPassword('ﬁle', FAST); // "ﬁle" with the fi ligature

    await expect(verifyPassword('file', stored)).resolves.toBe(true);
  });

  const salt = Buffer.alloc(16, 1).toString('base64');
  const key = Buffer.alloc(32, 2).toString('base64');
  const short = Buffer.alloc(15, 3).toString('base64');

  it.each([
    ['another algorithm', `$argon2id$v=19$m=19456,t=2,p=1$${salt}$${key}`],
    ['missing parts', `$scrypt$ln=4,r=8,p=1$${salt}`],
    ['logN 0', `$scrypt$ln=0,r=8,p=1$${salt}$${key}`],
    ['r 0', `$scrypt$ln=4,r=0,p=1$${salt}$${key}`],
    ['more than 256 MiB of memory', `$scrypt$ln=19,r=8,p=1$${salt}$${key}`],
    ['p 0', `$scrypt$ln=4,r=8,p=0$${salt}$${key}`],
    ['p above 4', `$scrypt$ln=4,r=8,p=5$${salt}$${key}`],
    ['a short salt', `$scrypt$ln=4,r=8,p=1$${short}$${key}`],
    ['a short key (an empty key would match anything)', `$scrypt$ln=4,r=8,p=1$${salt}$A`],
  ])('rejects a stored hash with %s', async (_case, stored) => {
    await expect(verifyPassword('anything', stored)).rejects.toThrow('Stored password hash has an unknown format');
  });
});

describe('HashingGate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs up to `concurrency` tasks at once and hands a freed slot to the next waiter', async () => {
    const gate = new HashingGate({ concurrency: 2, waitMs: 1_000 });
    const first = deferred();
    const second = deferred();
    const started: string[] = [];

    const a = gate.run(async () => {
      started.push('a');
      await first.promise;
    });
    const b = gate.run(async () => {
      started.push('b');
      await second.promise;
    });
    const c = gate.run(async () => {
      started.push('c');
    });
    await Promise.resolve();

    expect(started).toEqual(['a', 'b']);

    first.resolve();
    await a;
    await c;
    expect(started).toEqual(['a', 'b', 'c']);

    second.resolve();
    await b;
    // All slots free again: two more run at once.
    await Promise.all([gate.run(async () => started.push('d')), gate.run(async () => started.push('e'))]);
    expect(gate['active']).toBe(0);
  });

  it('releases the slot when the task throws', async () => {
    const gate = new HashingGate({ concurrency: 1, waitMs: 0 });

    await expect(gate.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(gate.run(async () => 'next')).resolves.toBe('next');
  });

  it('answers 503 when no slot frees up within waitMs and forgets that waiter', async () => {
    vi.useFakeTimers();
    const gate = new HashingGate({ concurrency: 1, waitMs: 500 });
    const holder = deferred();
    const held = gate.run(() => holder.promise);
    const timedOut = gate.run(async () => 'never');
    const timedOutResult = timedOut.catch((error: unknown) => error);

    vi.advanceTimersByTime(400);
    const waiting = gate.run(async () => 'later');
    const timedOutWaiter = gate['waiting'][0];
    vi.advanceTimersByTime(100);
    const error = await timedOutResult;

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(isAppError(error) && error.status).toBe(503);
    expect(gate['waiting']).toHaveLength(1);
    expect(gate['waiting']).not.toContain(timedOutWaiter);

    // The second waiter has its own timer; releasing the slot in time hands it over.
    holder.resolve();
    await held;
    await expect(waiting).resolves.toBe('later');
    expect(gate['active']).toBe(0);
  });
});

describe('PasswordHasher', () => {
  it('uses the production cost by default', () => {
    expect(new PasswordHasher({ concurrency: 1, waitMs: 0 }).params).toBe(PASSWORD_SCRYPT_PARAMS);
  });

  it('hashes and verifies inside a gate slot', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 0, params: FAST });

    const ok = await hasher.withSlot(async ({ hash, verify }) => {
      const stored = await hash('s3cret-password');

      expect(stored).toMatch(STORED);
      return [await verify('s3cret-password', stored), await verify('wrong-password', stored)];
    });

    expect(ok).toEqual([true, false]);
  });

  it('runs scrypt against one dummy hash for an unknown user and refuses', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 0, params: FAST });

    await expect(hasher.withSlot(({ verify }) => verify('anything', null))).resolves.toBe(false);
    const dummy = hasher['dummyHash'];
    await expect(dummy).resolves.toMatch(STORED);
    await expect(hasher.withSlot(({ verify }) => verify('anything', null))).resolves.toBe(false);
    expect(hasher['dummyHash']).toBe(dummy);
  });

  it('answers 503 when the gate stays saturated', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 5, params: FAST });
    const holder = deferred();
    const held = hasher.withSlot(() => holder.promise);

    await expect(hasher.withSlot(async () => 'never')).rejects.toBeInstanceOf(ServiceUnavailableError);
    holder.resolve();
    await held;
  });
});
