import { User, type Role } from '@devmentor/db';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { ServiceUnavailableError } from '../http/errors';
import { signToken } from '../security/jwt';
import { signSession, SESSION_TTL_SECONDS } from '../security/session-token';
import { AccountService } from '../services/auth/account.service';
import type { Clock } from '../time/clock';
import { getSessionUser } from './session-user';

const SECRET = 'a'.repeat(64);
const PREVIOUS = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const OPERATOR = 'founder@devmentor.test';
const NOW = new Date('2026-10-26T12:00:00.000Z');
const VERIFIED_AT = new Date('2026-10-01T08:00:00.000Z');
const clock: Clock = { now: () => NOW };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: USER_ID,
    email: 'octo@devmentor.test',
    roles: ['mentee'] as Role[],
    sessionVersion: 2,
    githubId: 4242,
    githubLogin: 'octo-cat',
    avatarUrl: 'https://avatars.example.test/u/4242',
    emailVerifiedAt: VERIFIED_AT,
    ...overrides,
  });
}

interface SetupOptions {
  user?: User | null;
  sessionSecret?: string;
  previousSecret?: string;
}

function setup({ user = makeUser(), sessionSecret = SECRET, previousSecret }: SetupOptions = {}) {
  const em = {
    findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (user?.id === where.id ? user : null)),
    flush: vi.fn(async () => undefined),
  };
  const events = { emit: vi.fn(async () => undefined) };
  const env = parseEnv({
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    OPERATOR_EMAILS: OPERATOR,
    ...(sessionSecret === '' ? {} : { SESSION_SECRET: sessionSecret }),
    ...(previousSecret === undefined ? {} : { SESSION_SECRET_PREVIOUS: previousSecret }),
  });
  const accountService = new AccountService({
    em: em as unknown as Cradle['em'],
    env,
    clock,
    events: events as unknown as Cradle['events'],
    logger: { info: vi.fn(), warn: vi.fn() } as unknown as Cradle['logger'],
  });
  const deps = { em: em as unknown as Cradle['em'], env, clock, accountService };

  return { deps, em, events, user };
}

const token = (sv = 2, secret = SECRET, sub = USER_ID) => signSession({ sub, sv }, secret, clock);

describe('getSessionUser', () => {
  it('returns the session user for a valid token', async () => {
    const { deps, em, events } = setup();

    await expect(getSessionUser(await token(), deps)).resolves.toEqual({
      id: USER_ID,
      email: 'octo@devmentor.test',
      roles: ['mentee'],
      githubLogin: 'octo-cat',
      avatarUrl: 'https://avatars.example.test/u/4242',
      emailVerified: true,
    });
    expect(em.findOne).toHaveBeenCalledWith(User, { id: USER_ID });
    expect(em.flush).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('maps a user without GitHub data and without a verified email', async () => {
    const { deps } = setup({ user: makeUser({ githubId: null, githubLogin: null, avatarUrl: null, emailVerifiedAt: null }) });

    await expect(getSessionUser(await token(), deps)).resolves.toMatchObject({
      githubLogin: null,
      avatarUrl: null,
      emailVerified: false,
    });
  });

  it('returns a copy of the roles, not the entity array', async () => {
    const { deps, user } = setup();
    const sessionUser = await getSessionUser(await token(), deps);

    expect(sessionUser?.roles).not.toBe(user?.roles);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('returns null without touching the database when the cookie is %s', async (_case, cookie) => {
    const { deps, em } = setup();

    await expect(getSessionUser(cookie, deps)).resolves.toBeNull();
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('returns null without a cookie even when SESSION_SECRET is missing', async () => {
    const { deps } = setup({ sessionSecret: '' });

    await expect(getSessionUser(undefined, deps)).resolves.toBeNull();
  });

  it('fails closed with a 503 when a cookie is present but SESSION_SECRET is missing', async () => {
    const cookie = await token();
    const { deps, em } = setup({ sessionSecret: '' });

    await expect(getSessionUser(cookie, deps)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('returns null for a tampered token', async () => {
    const { deps, em } = setup();
    const [header, payload, signature] = (await token()).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: USER_ID, sv: 2, aud: 'session', exp: 9_999_999_999 })).toString(
      'base64url',
    );

    expect(payload).not.toBe(forged);
    await expect(getSessionUser([header, forged, signature].join('.'), deps)).resolves.toBeNull();
    await expect(getSessionUser('not-a-jwt', deps)).resolves.toBeNull();
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('returns null for a token signed with an unknown secret', async () => {
    const { deps } = setup();

    await expect(getSessionUser(await token(2, OTHER), deps)).resolves.toBeNull();
  });

  it('returns null for a token with the wrong audience', async () => {
    const { deps, em } = setup();
    const oauthState = await signToken({ sub: USER_ID, sv: 2 }, { audience: 'oauth-state', ttlSeconds: 600 }, SECRET, clock);

    await expect(getSessionUser(oauthState, deps)).resolves.toBeNull();
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('returns null for an expired token', async () => {
    const { deps } = setup();
    const dayAgo: Clock = { now: () => new Date(NOW.getTime() - (SESSION_TTL_SECONDS + 1) * 1000) };
    const expired = await signSession({ sub: USER_ID, sv: 2 }, SECRET, dayAgo);

    await expect(getSessionUser(expired, deps)).resolves.toBeNull();
  });

  it('returns null for a token with malformed claims', async () => {
    const { deps } = setup();
    const noSv = await new SignJWT({ sub: USER_ID })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('session')
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 60)
      .sign(new TextEncoder().encode(SECRET));

    await expect(getSessionUser(noSv, deps)).resolves.toBeNull();
  });

  it('accepts a token signed with the previous secret after a rotation', async () => {
    const { deps } = setup({ sessionSecret: SECRET, previousSecret: PREVIOUS });

    await expect(getSessionUser(await token(2, PREVIOUS), deps)).resolves.toMatchObject({ id: USER_ID });
  });

  it('refuses a token signed with the previous secret once it is no longer configured', async () => {
    const { deps } = setup({ sessionSecret: SECRET });

    await expect(getSessionUser(await token(2, PREVIOUS), deps)).resolves.toBeNull();
  });

  it('returns null for an unknown (or deleted) user', async () => {
    const { deps, em } = setup({ user: null });

    await expect(getSessionUser(await token(), deps)).resolves.toBeNull();
    expect(em.findOne).toHaveBeenCalledWith(User, { id: USER_ID });
  });

  it.each([
    ['older', 1],
    ['newer', 3],
  ])('returns null when the token carries an %s session version', async (_case, sv) => {
    const { deps, em } = setup();

    await expect(getSessionUser(await token(sv), deps)).resolves.toBeNull();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('throws (500) on stored empty roles before reconciling, never returns null', async () => {
    const { deps, em, events, user } = setup({ user: makeUser({ roles: [] }) });

    await expect(getSessionUser(await token(), deps)).rejects.toThrow(`Stored roles of user ${USER_ID} are empty`);
    expect(user?.roles).toEqual([]);
    expect(em.flush).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('adds operator live when the verified email is on the allowlist and persists it', async () => {
    const { deps, em, events, user } = setup({ user: makeUser({ email: OPERATOR, roles: ['mentee', 'mentor'] }) });

    await expect(getSessionUser(await token(), deps)).resolves.toMatchObject({
      roles: ['mentee', 'mentor', 'operator'],
    });
    expect(user?.roles).toEqual(['mentee', 'mentor', 'operator']);
    expect(user?.sessionVersion).toBe(2);
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', {
      userId: USER_ID,
      roles: ['mentee', 'mentor', 'operator'],
    });
  });

  it('drops a cached operator role live when the email left the allowlist', async () => {
    const { deps, events } = setup({ user: makeUser({ roles: ['mentee', 'operator'] }) });

    await expect(getSessionUser(await token(), deps)).resolves.toMatchObject({ roles: ['mentee'] });
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', { userId: USER_ID, roles: ['mentee'] });
  });

  it('does not grant operator for an allowlisted but unverified email', async () => {
    const { deps } = setup({ user: makeUser({ email: OPERATOR, emailVerifiedAt: null }) });

    await expect(getSessionUser(await token(), deps)).resolves.toMatchObject({ roles: ['mentee'] });
  });

  it('keeps an operator whose cached role agrees without writing', async () => {
    const { deps, em, events } = setup({ user: makeUser({ email: OPERATOR, roles: ['mentee', 'operator'] }) });

    await expect(getSessionUser(await token(), deps)).resolves.toMatchObject({ roles: ['mentee', 'operator'] });
    expect(em.flush).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
