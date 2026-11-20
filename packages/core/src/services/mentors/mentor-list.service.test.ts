import { randomUUID } from 'node:crypto';
import { MentorProfile, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { PlatformSettingsService } from '../operator/platform-settings.service';
import type { BookableSummary } from '../availability/slot.service';
import { MentorListService } from './mentor-list.service';
import { offerState, pageFields } from './mentor-profile.service';
import { mentorOfferReady, mentorPagePublishable } from './readiness';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const BOUNDS = { '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } };
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

interface Fixture {
  name: string;
  profile: MentorProfile;
  slots: number;
}

/** A published, complete, priced mentor with `mentor`, published availability at `keyHours` from now. */
function mentor(name: string, keyHours: number, overrides: Partial<MentorProfile> = {}, roles: User['roles'] = ['mentee', 'mentor']) {
  const user = Object.assign(new User(), { id: randomUUID(), email: `${name}@devmentor.test`, roles, avatarUrl: null });
  return Object.assign(new MentorProfile(), {
    id: randomUUID(),
    user: { id: user.id, getEntity: () => user },
    displayName: name,
    publicWorkUrl: `https://github.com/${name}`,
    bio: `${name} builds things.`,
    stackTags: ['python'],
    slug: name.toLowerCase(),
    publishedAt: at(-100),
    price25Cents: 15000,
    price50Cents: 30000,
    lastPublishedAvailabilityAt: at(keyHours),
    ...overrides,
  });
}

/** In-memory `em.find` for the candidate query: published, optional tag (`@>`), key desc, id asc. */
function fakeEm(fixtures: Fixture[]) {
  return {
    find: vi.fn(async (_entity: unknown, where: { stackTags?: { $contains: string[] } }) =>
      fixtures
        .map((fixture) => fixture.profile)
        .filter((profile) => profile.publishedAt != null)
        .filter((profile) => where.stackTags === undefined || where.stackTags.$contains.every((tag) => profile.stackTags.includes(tag as never)))
        .sort(
          (a, b) =>
            (b.lastPublishedAvailabilityAt?.getTime() ?? 0) - (a.lastPublishedAvailabilityAt?.getTime() ?? 0) ||
            a.id.localeCompare(b.id),
        ),
    ),
  };
}

function setup(fixtures: Fixture[], configured = true) {
  const em = fakeEm(fixtures);
  const slotService = {
    bookableSummaryFor: vi.fn(async (ids: readonly string[], ...rest: [Date]) => {
      void rest;
      const map = new Map<string, BookableSummary>();
      for (const fixture of fixtures) {
        if (ids.includes(fixture.profile.id) && fixture.slots > 0) {
          map.set(fixture.profile.id, { count: fixture.slots, nextStartsAt: at(24) });
        }
      }
      return map;
    }),
  };
  const settings = new PlatformSettingsService({
    env: parseEnv(
      configured
        ? { DATABASE_URL: 'postgres://u:p@localhost:5432/db', PLATFORM_CURRENCY: 'PLN', PLATFORM_PRICE_BOUNDS: JSON.stringify(BOUNDS) }
        : { DATABASE_URL: 'postgres://u:p@localhost:5432/db' },
    ),
  });
  const service = new MentorListService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    slotService: slotService as unknown as Cradle['slotService'],
    platformSettingsService: settings,
  });

  return { em, service, slotService, settings };
}

const ready = (name: string, keyHours: number, tags: MentorProfile['stackTags'] = ['python']): Fixture => ({
  name,
  profile: mentor(name, keyHours, { stackTags: tags }),
  slots: 2,
});

describe('MentorListService.listBookable', () => {
  it('lists bookable mentors by most recent published availability, then id; one clock, one summary query', async () => {
    const fixtures = [ready('Ada', -30), ready('Bob', -10), ready('Cy', -20)];
    const { em, service, slotService } = setup(fixtures);

    const items = await service.listBookable();

    expect(items.map((item) => item.displayName)).toEqual(['Bob', 'Cy', 'Ada']);
    expect(items[0]).toEqual({
      slug: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      publicWorkUrl: 'https://github.com/Bob',
      bio: 'Bob builds things.',
      stackTags: ['python'],
      prices: { price25Cents: 15000, price50Cents: 30000, currency: 'PLN' },
      nextBookableSlotAt: at(24).toISOString(),
    });
    expect(em.find).toHaveBeenCalledWith(MentorProfile, { publishedAt: { $ne: null } }, { populate: ['user'], orderBy: { lastPublishedAvailabilityAt: 'desc', id: 'asc' } });
    expect(slotService.bookableSummaryFor).toHaveBeenCalledOnce();
    expect(slotService.bookableSummaryFor.mock.calls[0]?.[1]).toBe(NOW);
    for (const fixture of fixtures) expect(fixture.profile.lastPublishedAvailabilityAt).not.toBeNull();
  });

  it('breaks ties by id (stable, not a ranking)', async () => {
    const a = ready('Ann', -5);
    const b = ready('Ben', -5);
    const { service } = setup([a, b]);

    const ids = [a.profile.id, b.profile.id].sort();

    expect((await service.listBookable()).map((item) => item.slug)).toEqual(
      ids.map((id) => (id === a.profile.id ? 'ann' : 'ben')),
    );
  });

  it('filters by one tag, a multi-tag mentor appearing under each of their tags', async () => {
    const multi = ready('Multi', -1, ['react', 'python']);
    const { em, service } = setup([ready('Py', -2, ['python']), ready('Re', -3, ['react']), multi]);

    expect((await service.listBookable({ tag: 'react' })).map((item) => item.slug)).toEqual(['multi', 're']);
    expect((await service.listBookable({ tag: 'python' })).map((item) => item.slug)).toEqual(['multi', 'py']);
    expect(em.find.mock.calls[0]?.[1]).toEqual({ publishedAt: { $ne: null }, stackTags: { $contains: ['react'] } });
  });

  it('includes a mentor if and only if mentorOfferReady is fully met (one definition)', async () => {
    const fixtures: Fixture[] = [
      ready('Ready', -1),
      { name: 'Draft', profile: mentor('Draft', -2, { publishedAt: null, slug: null }), slots: 2 },
      { name: 'NoSlots', profile: mentor('NoSlots', -3), slots: 0 },
      { name: 'NoPrices', profile: mentor('NoPrices', -4, { price25Cents: null }), slots: 2 },
      { name: 'OutOfBounds', profile: mentor('OutOfBounds', -5, { price50Cents: 70000 }), slots: 2 },
      { name: 'Revoked', profile: mentor('Revoked', -6, {}, ['mentee']), slots: 2 },
      { name: 'Incomplete', profile: mentor('Incomplete', -7, { bio: null }), slots: 2 },
    ];
    const { service, settings } = setup(fixtures);

    const listed = new Set((await service.listBookable()).map((item) => item.displayName));

    for (const { name, profile, slots } of fixtures) {
      const owner = profile.user.getEntity();
      const meetsDefinition =
        profile.publishedAt != null &&
        owner.roles.includes('mentor') &&
        mentorPagePublishable.isMet(pageFields(profile)) &&
        mentorOfferReady.evaluate(offerState(profile, slots, settings.tryGet())).every((item) => item.met);

      expect({ name, listed: listed.has(name) }).toEqual({ name, listed: meetsDefinition });
    }
    expect([...listed]).toEqual(['Ready']);
  });

  it('is empty, not an error, when price settings are missing (settings unmet, fail closed)', async () => {
    const { service } = setup([ready('Ada', -1)], false);

    await expect(service.listBookable()).resolves.toEqual([]);
  });

  it('has no cap', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ready(`M${i}`, -i - 1));
    const { service } = setup(many);

    expect(await service.listBookable()).toHaveLength(60);
  });
});
