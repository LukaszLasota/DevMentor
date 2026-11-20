import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { entities } from '../index';
import { StripeEvent, StripeEventSchema } from './stripe-event.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(StripeEvent);

afterAll(async () => {
  await orm.close();
});

describe('StripeEvent entity', () => {
  it('is registered and maps to stripe_events keyed by the Stripe event id', () => {
    expect(entities).toContain(StripeEventSchema);
    expect(meta.tableName).toBe('stripe_events');
    expect(meta.primaryKeys).toEqual(['id']);
    expect(meta.checks.map((check) => check.name).sort()).toEqual([
      'stripe_events_attempts_check',
      'stripe_events_processed_check',
    ]);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual([
      'attempts',
      'id',
      'lastError',
      'payload',
      'processedAt',
      'receivedAt',
      'type',
    ]);
    expect(column('id')).toEqual({ field: 'id', type: 'text', nullable: false });
    expect(column('type')).toEqual({ field: 'type', type: 'text', nullable: false });
    expect(column('payload')).toEqual({ field: 'payload', type: 'text', nullable: false });
    expect(column('receivedAt')).toEqual({ field: 'received_at', type: 'timestamptz', nullable: false });
    expect(column('processedAt')).toEqual({ field: 'processed_at', type: 'timestamptz', nullable: true });
    expect(column('attempts')).toEqual({ field: 'attempts', type: 'int', nullable: false });
    expect(meta.properties.attempts.default).toBe(0);
    expect(column('lastError')).toEqual({ field: 'last_error', type: 'text', nullable: true });
  });
});
