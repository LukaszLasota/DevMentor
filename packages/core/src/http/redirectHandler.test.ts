import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import { logger } from '../logger';
import { AppError, ServiceUnavailableError } from './errors';
import { redirectHandler } from './redirectHandler';

const cradle = { marker: 'test-cradle' } as unknown as Cradle;

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: Cradle) => Promise<T>) => fn(cradle),
}));

const noParams = { params: Promise.resolve({}) };
const OPTIONS = { errorRedirect: '/sign-in' };

function request(): Request {
  return new Request('http://localhost/api/auth/github/callback?code=c&state=s');
}

describe('redirectHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to the handler location with its cookies and the scoped cradle', async () => {
    const handler = vi.fn(async () => ({ location: '/mentor?tab=1', cookies: ['dm_session=t; Path=/', 'dm_oauth=; Max-Age=0'] }));

    const res = await redirectHandler(handler, OPTIONS)(request(), { params: Promise.resolve({ id: 'x' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/mentor?tab=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.getSetCookie()).toEqual(['dm_session=t; Path=/', 'dm_oauth=; Max-Age=0']);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ cradle, params: { id: 'x' } }));
  });

  it('needs no CSRF header and sets no cookie when none is returned', async () => {
    const res = await redirectHandler(async () => ({ location: '/' }), OPTIONS)(request(), noParams);

    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it.each(['https://evil.example/', '//evil.example', '/api/auth/me'])('passes %s through safeReturnTo', async (location) => {
    const res = await redirectHandler(async () => ({ location }), OPTIONS)(request(), noParams);

    expect(res.headers.get('location')).toBe('/');
  });

  it('sends an external location built by server code as is', async () => {
    const externalLocation = new URL('https://github.com/login/oauth/authorize?client_id=abc&state=s');

    const res = await redirectHandler(async () => ({ externalLocation, cookies: ['dm_oauth=x'] }), OPTIONS)(
      request(),
      noParams,
    );

    expect(res.headers.get('location')).toBe(externalLocation.href);
    expect(res.headers.getSetCookie()).toEqual(['dm_oauth=x']);
  });

  it('turns an AppError into errorRedirect with the lower-cased code', async () => {
    const res = await redirectHandler(async () => {
      throw new AppError(409, 'GITHUB_ACCOUNT_CONFLICT', 'Conflict.');
    }, OPTIONS)(request(), noParams);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/sign-in?error=github_account_conflict');
  });

  it('applies errorCodes, keeps the errorRedirect query and sets errorCookies', async () => {
    const res = await redirectHandler(
      async () => {
        throw new ServiceUnavailableError();
      },
      {
        errorRedirect: '/sign-in?returnTo=%2Fmentor',
        errorCodes: { SERVICE_UNAVAILABLE: 'github_unavailable' },
        errorCookies: ['dm_oauth=; Max-Age=0'],
      },
    )(request(), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?returnTo=%2Fmentor&error=github_unavailable');
    expect(res.headers.getSetCookie()).toEqual(['dm_oauth=; Max-Age=0']);
  });

  it('maps a ZodError to validation_error without logging', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await redirectHandler(async () => {
      z.object({ code: z.string() }).parse({});
      return { location: '/' };
    }, OPTIONS)(request(), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=validation_error');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs an unexpected error and redirects with error=unexpected', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await redirectHandler(async () => {
      throw new Error('boom');
    }, OPTIONS)(request(), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=unexpected');
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/auth/github/callback' }),
      'Unhandled redirect error',
    );
  });
});
