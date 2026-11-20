import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env';
import { PlatformSettingsService, SETTINGS_UNAVAILABLE_MESSAGE } from './platform-settings.service';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';
const BOUNDS = { '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } };

const service = (configured: boolean) =>
  new PlatformSettingsService({
    env: parseEnv(
      configured
        ? { DATABASE_URL, PLATFORM_CURRENCY: 'PLN', PLATFORM_PRICE_BOUNDS: JSON.stringify(BOUNDS) }
        : { DATABASE_URL },
    ),
  });

describe('PlatformSettingsService', () => {
  it('returns the currency and both bounds when configured', () => {
    expect(service(true).get()).toEqual({ currency: 'PLN', bounds: BOUNDS });
    expect(service(true).tryGet()).toEqual({ currency: 'PLN', bounds: BOUNDS });
    expect(service(true).boundsFor('25')).toEqual({ minCents: 5000, maxCents: 30000 });
    expect(service(true).boundsFor('50')).toEqual({ minCents: 10000, maxCents: 60000 });
  });

  it('fails closed when unconfigured: tryGet null, get and boundsFor 503', () => {
    expect(service(false).tryGet()).toBeNull();
    expect(() => service(false).get()).toThrow(SETTINGS_UNAVAILABLE_MESSAGE);
    expect(() => service(false).boundsFor('25')).toThrow(expect.objectContaining({ status: 503, code: 'SERVICE_UNAVAILABLE' }));
  });
});
