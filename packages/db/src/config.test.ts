import { describe, expect, it } from 'vitest';
import { createConfig } from './config';
import { entities } from './entities';

const options = { clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 1, max: 5 }, debug: true };

describe('createConfig', () => {
  it('maps the explicit options and registers all entities', () => {
    const config = createConfig(options);

    expect(config).toMatchObject({
      clientUrl: options.clientUrl,
      pool: { min: 1, max: 5 },
      debug: true,
      discovery: { warnWhenNoEntities: false },
    });
    expect(config.entities).toBe(entities);
  });

  it('applies overrides on top of the base config', () => {
    expect(createConfig(options, { debug: false, dbName: 'other' })).toMatchObject({ debug: false, dbName: 'other' });
  });
});
