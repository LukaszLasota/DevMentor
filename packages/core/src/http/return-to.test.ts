import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

const FALLBACK = '/mentors';

describe('safeReturnTo', () => {
  it.each(['/', '/mentor', '/invitation/abc?x=1#top', '/apis', '/api-docs', '/_nextish'])('accepts %s', (value) => {
    expect(safeReturnTo(value, FALLBACK)).toBe(value);
  });

  it('normalizes dot segments', () => {
    expect(safeReturnTo('/a/../mentor', FALLBACK)).toBe('/mentor');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['relative without slash', 'mentor'],
    ['absolute URL', 'https://evil.example/'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['tab', '/\t/evil.example'],
    ['newline', '/\n/evil.example'],
    ['api', '/api'],
    ['api path', '/api/auth/me'],
    ['api upper case', '/API/auth/me'],
    ['api via dot segments', '/x/../api/auth/me'],
    ['next assets', '/_next/static/chunk.js'],
  ])('falls back for %s', (_label, value) => {
    expect(safeReturnTo(value, FALLBACK)).toBe(FALLBACK);
  });
});
