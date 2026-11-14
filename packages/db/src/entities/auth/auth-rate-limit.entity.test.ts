import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { entities } from '../index';
import { AuthRateLimit, AuthRateLimitSchema } from './auth-rate-limit.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(AuthRateLimit);

afterAll(async () => {
  await orm.close();
});

describe('AuthRateLimit entity', () => {
  it('is registered and maps to auth_rate_limits with a natural text key', () => {
    expect(entities).toContain(AuthRateLimitSchema);
    expect(meta.tableName).toBe('auth_rate_limits');
    expect(meta.primaryKeys).toEqual(['key']);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual(['count', 'key', 'windowStart']);
    expect(column('key')).toEqual({ field: 'key', type: 'text', nullable: false });
    expect(column('windowStart')).toEqual({ field: 'window_start', type: 'timestamptz', nullable: false });
    expect(column('count')).toEqual({ field: 'count', type: 'int', nullable: false });
  });
});
