import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { MentorProfileSchema } from '../mentors/mentor-profile.entity';

const now = () => new Date();

/** Named so `SlotService` maps a duplicate active start (and only that) to 409. */
export const ACTIVE_SLOT_UNIQUE = 'slots_mentor_starts_at_active_uq';

/** Predicate of the partial unique index: a removed slot does not block republishing its start. */
export const ACTIVE_SLOT = 'removed_at is null';

/**
 * A mentor's published start instant (spec 2026-10-21-availability-slots), stored in UTC. The mentor
 * removes it softly (`removed_at`, row kept so #29 can explain a vanished slot). No booking relation:
 * #29 adds an immutable `Booking.slotId` and owns occupancy. Goes with its profile (`on delete cascade`).
 */
export const SlotSchema = defineEntity({
  name: 'Slot',
  tableName: 'slots',
  uniques: [{ name: ACTIVE_SLOT_UNIQUE, properties: ['mentorProfile', 'startsAt'], where: ACTIVE_SLOT }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    mentorProfile: () => p.manyToOne(MentorProfileSchema).ref().deleteRule('cascade'),
    startsAt: p.datetime(),
    removedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class Slot extends SlotSchema.class {}

SlotSchema.setClass(Slot);
