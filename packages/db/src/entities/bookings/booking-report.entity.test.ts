import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { entities } from '../index';
import { Booking } from './booking.entity';
import { BOOKING_REPORT_BOOKING_UNIQUE, BOOKING_REPORT_MESSAGE_CHECK, BookingReport, BookingReportSchema } from './booking-report.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }));
const meta = orm.getMetadata().get(BookingReport);

afterAll(async () => {
  await orm.close();
});

describe('BookingReport entity', () => {
  it('is registered and maps to booking_reports with a uuid key and a bounded message', () => {
    expect(entities).toContain(BookingReportSchema);
    expect(meta.tableName).toBe('booking_reports');
    expect(meta.properties.message.columnTypes[0]).toBe('text');
    expect(meta.properties.createdAt.columnTypes[0]).toBe('timestamptz');
    expect(meta.checks).toEqual([{ name: 'booking_reports_message_check', expression: BOOKING_REPORT_MESSAGE_CHECK }]);
    expect(BOOKING_REPORT_MESSAGE_CHECK).toBe('char_length(message) between 20 and 2000');
  });

  it('belongs to one booking through a unique, restricting key', () => {
    const prop = meta.properties.booking;

    expect(prop.kind).toBe(ReferenceKind.ONE_TO_ONE);
    expect(prop.targetMeta?.class).toBe(Booking);
    expect(prop.fieldNames).toEqual(['booking_id']);
    expect(prop.deleteRule).toBe('restrict');
    expect(prop.unique).toBe(true);
    // MikroORM's default name for the column's unique constraint (the migration creates it by that name).
    expect(BOOKING_REPORT_BOOKING_UNIQUE).toBe('booking_reports_booking_id_unique');
  });

  it('generates the id and the creation time', () => {
    expect(meta.properties.id.onCreate?.({} as BookingReport, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.properties.createdAt.onCreate?.({} as BookingReport, orm.em)).toBeInstanceOf(Date);
  });
});
