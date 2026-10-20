import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { ServiceUnavailableError } from '../../http/errors';
import { HealthService } from './health.service';

function setup(execute: () => Promise<unknown>) {
  const logger = { warn: vi.fn() } as unknown as Cradle['logger'];
  const em = { execute: vi.fn(execute) } as unknown as Cradle['em'];

  return { logger, service: new HealthService({ em, logger }) };
}

describe('HealthService', () => {
  it('reports the database as up', async () => {
    const { service } = setup(async () => [{ '?column?': 1 }]);

    await expect(service.check()).resolves.toEqual({ database: 'up' });
  });

  it('throws ServiceUnavailableError and logs the cause when the query fails', async () => {
    const { service, logger } = setup(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.any(String));
  });
});
