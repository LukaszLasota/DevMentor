import { randomUUID } from 'node:crypto';
import { LockMode, MENTOR_PROFILE_SLUG_KEY, MentorProfile, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { isAppError } from '../../http/errors';
import {
  allowedRange,
  MAX_SLUG_ATTEMPTS,
  MentorProfileService,
  NOT_PUBLISHABLE_MESSAGE,
  PAGE_NOT_FOUND_MESSAGE,
  PRICES_OUT_OF_BOUNDS_MESSAGE,
  PROFILE_NOT_FOUND_MESSAGE,
  PUBLISHED_EDIT_MESSAGE,
  SLUG_CONFLICT_MESSAGE,
} from './mentor-profile.service';
import type { MentorProfileUpdateInput } from '../../validators/mentors/mentor-profile-update.schema';
import { parseEnv } from '../../config/env';
import { PlatformSettingsService } from '../operator/platform-settings.service';
import { PAGE_REQUIREMENT_MESSAGES, type MentorPageRequirement } from './readiness';

const NOW = new Date('2026-11-20T10:00:00.000Z');
const EARLIER = new Date('2026-11-01T08:00:00.000Z');
const DUE = new Date('2026-11-28T12:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const AVATAR = 'https://avatars.example/ada.png';

const PAGE_KEYS = ['avatarUrl', 'bio', 'displayName', 'publicWorkUrl', 'slug', 'stackTags'];
const PUBLIC_KEYS = [...PAGE_KEYS, 'offerReady', 'prices', 'slots'];
const OWNER_KEYS = [...PAGE_KEYS, 'initialPublishDueAt', 'offerReadiness', 'priceBounds', 'prices', 'publishedAt', 'readiness'].sort();
const BOUNDS = { '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } };
const PRICED = { price25Cents: 15000, price50Cents: 30000 };
const SLOT = { id: 's1', startsAt: '2026-11-21T09:00:00.000Z', meetsLeadTime: true, bookableLengths: ['25', '50'] as ('25' | '50')[] };

/** Key equality, never a subset check: a new field must be added to the allowlist on purpose. */
function expectProjectionKeys(dto: object, keys: readonly string[]) {
  expect(Object.keys(dto).sort()).toEqual([...keys].sort());
}

const COMPLETE = {
  displayName: 'Ada Lovelace',
  publicWorkUrl: 'https://github.com/ada/engine',
  bio: 'Wrote the first program.',
  stackTags: ['python'] as MentorProfile['stackTags'],
};

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: randomUUID(),
    email: 'ada@devmentor.test',
    roles: ['mentee', 'mentor'],
    avatarUrl: AVATAR,
    githubLogin: 'ada',
    ...overrides,
  });
}

/** A stored row: `user` is a reference whose entity is the user (as after `populate`). */
function makeRow(user: User, fields: Partial<MentorProfile> = {}): MentorProfile {
  return Object.assign(new MentorProfile(), {
    id: randomUUID(),
    user: { id: user.id, getEntity: () => user },
    initialPublishDueAt: DUE,
    displayName: null,
    publicWorkUrl: null,
    bio: null,
    stackTags: [],
    slug: null,
    publishedAt: null,
    ...fields,
  });
}

function collision(constraint = MENTOR_PROFILE_SLUG_KEY) {
  return new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint }));
}

type Where = Record<string, unknown>;

/**
 * In-memory stand-in for the scoped `EntityManager`. `findOne` hands out copies of the stored rows;
 * `transactional` writes the copies back only when the callback succeeds and no two rows share a
 * slug (the `mentor_profiles_slug_key` check), so a refused attempt leaves the rows untouched.
 */
function fakeEm(rows: MentorProfile[], users: User[], options: { failCommit?: () => Error | undefined } = {}) {
  let touched: MentorProfile[] = [];
  const em = {
    transactions: 0,
    findOne: vi.fn(async (entity: unknown, where: Where) => {
      if (entity === User) {
        return users.find((user) => user.id === where.id) ?? null;
      }

      const row = rows.find((candidate) =>
        'user' in where
          ? candidate.user.id === where.user
          : candidate.slug === where.slug && candidate.publishedAt != null,
      );

      if (row === undefined) {
        return null;
      }

      const copy = Object.assign(new MentorProfile(), row, { stackTags: [...row.stackTags] });
      touched.push(copy);

      return copy;
    }),
    assign: vi.fn((entity: object, data: object) => Object.assign(entity, data)),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      em.transactions += 1;
      touched = [];
      const result = await callback(em);
      const failure = options.failCommit?.();

      if (failure) {
        throw failure;
      }

      for (const copy of touched) {
        if (copy.slug != null && rows.some((row) => row.id !== copy.id && row.slug === copy.slug)) {
          throw collision();
        }
      }

      for (const copy of touched) {
        Object.assign(rows.find((row) => row.id === copy.id) as MentorProfile, copy);
      }

      return result;
    }),
  };

  return em;
}

function setup(rows: MentorProfile[], users: User[], options: Parameters<typeof fakeEm>[2] = {}, configured = true) {
  const em = fakeEm(rows, users, options);
  const events = { emit: vi.fn(async () => undefined) };
  // Slot reads are SlotService's (tested there); here only their effect on the two DTOs.
  const slotService = {
    countBookable: vi.fn<(profileId: string, now: Date) => Promise<number>>(async () => 0),
    listPublicFor: vi.fn<(profileId: string, now: Date) => Promise<(typeof SLOT)[]>>(async () => [SLOT]),
  };
  const service = new MentorProfileService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
    slotService: slotService as unknown as Cradle['slotService'],
    platformSettingsService: new PlatformSettingsService({
      env: parseEnv(
        configured
          ? { DATABASE_URL: 'postgres://u:p@localhost:5432/db', PLATFORM_CURRENCY: 'PLN', PLATFORM_PRICE_BOUNDS: JSON.stringify(BOUNDS) }
          : { DATABASE_URL: 'postgres://u:p@localhost:5432/db' },
      ),
    }),
  });

  return { em, events, service, slotService };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

function ownerWith(fields: Partial<MentorProfile> = {}) {
  const user = makeUser();
  const row = makeRow(user, fields);

  return { user, row, ...setup([row], [user]) };
}

describe('MentorProfileService.findOwn', () => {
  it("returns the owner's page with its publish-by date", async () => {
    const { user, service } = ownerWith();

    expect(await service.findOwn(user.id)).toMatchObject({ initialPublishDueAt: DUE.toISOString(), publishedAt: null });
  });

  it('returns null without a profile', async () => {
    const user = makeUser();
    const { service } = setup([], [user]);

    await expect(service.findOwn(user.id)).resolves.toBeNull();
  });
});

describe('MentorProfileService.getOwn', () => {
  it('returns the owner DTO with the publish checklist and no slug for a draft', async () => {
    const { user, service } = ownerWith({ displayName: 'Ada', stackTags: ['react'] });

    const own = await service.getOwn(user.id);

    expectProjectionKeys(own, OWNER_KEYS);
    expect(own).toEqual({
      slug: null,
      displayName: 'Ada',
      avatarUrl: AVATAR,
      publicWorkUrl: null,
      bio: null,
      stackTags: ['react'],
      publishedAt: null,
      initialPublishDueAt: DUE.toISOString(),
      readiness: [
        { key: 'displayName', met: true },
        { key: 'publicWorkUrl', met: false },
        { key: 'bio', met: false },
        { key: 'stackTags', met: true },
      ],
      offerReadiness: [
        { key: 'published', met: false },
        { key: 'settings', met: true },
        { key: 'price25', met: false },
        { key: 'price50', met: false },
        { key: 'hasBookableSlot', met: false },
      ],
      prices: null,
      priceBounds: { p25: BOUNDS['25'], p50: BOUNDS['50'] },
    });
  });

  it('reports the bookability gate from the bookable-slot count at request time', async () => {
    const { user, row, service, slotService } = ownerWith({ ...COMPLETE, ...PRICED, slug: 'ada', publishedAt: EARLIER });
    slotService.countBookable.mockResolvedValue(2);

    expect((await service.getOwn(user.id)).offerReadiness.every((item) => item.met)).toBe(true);
    expect(slotService.countBookable).toHaveBeenCalledWith(row.id, NOW);
  });

  it('answers 404 without a profile and never creates one', async () => {
    const user = makeUser();
    const { service } = setup([], [user]);

    expect(await rejection(service.getOwn(user.id))).toMatchObject({ status: 404, message: PROFILE_NOT_FOUND_MESSAGE });
  });

  it('shows no avatar when the user row has none (or is gone)', async () => {
    const user = makeUser({ avatarUrl: null });
    const { service } = setup([makeRow(user, { initialPublishDueAt: null })], []);

    expect(await service.getOwn(user.id)).toMatchObject({ avatarUrl: null, initialPublishDueAt: null });
  });
});

describe('MentorProfileService.updateOwn', () => {
  it('saves a draft without a public-work link, under the row lock', async () => {
    const { user, row, em, service } = ownerWith();

    const own = await service.updateOwn(user.id, { displayName: 'Ada', bio: 'Engines.', stackTags: ['react'] });

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: user.id }, LOCK);
    expect(own).toMatchObject({ displayName: 'Ada', publicWorkUrl: null, bio: 'Engines.', stackTags: ['react'] });
    expect(row).toMatchObject({ displayName: 'Ada', bio: 'Engines.', publishedAt: null, slug: null });
  });

  it('keeps omitted fields and clears null ones', async () => {
    const { user, row, service } = ownerWith({ ...COMPLETE });

    await service.updateOwn(user.id, { bio: null });

    expect(row).toMatchObject({ displayName: COMPLETE.displayName, publicWorkUrl: COMPLETE.publicWorkUrl, bio: null });
  });

  it('lets a published mentor rename without touching the slug', async () => {
    const { user, row, service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });

    const own = await service.updateOwn(user.id, { displayName: 'Ada King' });

    expect(own).toMatchObject({ displayName: 'Ada King', slug: 'ada-lovelace', publishedAt: EARLIER.toISOString() });
    expect(row.slug).toBe('ada-lovelace');
  });

  it.each([
    ['displayName', { displayName: null }],
    ['publicWorkUrl', { publicWorkUrl: null }],
    ['bio', { bio: null }],
    ['stackTags', { stackTags: [] }],
  ] as [MentorPageRequirement, MentorProfileUpdateInput][])('refuses clearing %s on a published page and saves nothing', async (key, input) => {
    const { user, row, service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });

    const error = await rejection(service.updateOwn(user.id, { displayName: 'Renamed', ...input }));

    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: PUBLISHED_EDIT_MESSAGE,
      fieldErrors: { [key]: [PAGE_REQUIREMENT_MESSAGES[key]] },
    });
    expect(row).toMatchObject({ ...COMPLETE, publishedAt: EARLIER });
  });

  it('checks the gate on the state read under the lock (an unpublish that won the race allows the edit)', async () => {
    const { user, row, service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });
    await service.unpublish(user.id);

    await service.updateOwn(user.id, { publicWorkUrl: null });

    expect(row).toMatchObject({ publicWorkUrl: null, publishedAt: null, slug: 'ada-lovelace' });
  });

  it('answers 404 without a profile', async () => {
    const user = makeUser();
    const { service } = setup([], [user]);

    expect(await rejection(service.updateOwn(user.id, {}))).toMatchObject({ status: 404 });
  });
});

describe('MentorProfileService.publish', () => {
  it('publishes a complete page with a slug from the display name and emits after the commit', async () => {
    const { user, row, em, events, service } = ownerWith({ ...COMPLETE });

    const own = await service.publish(user.id);

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: user.id }, LOCK);
    expect(own).toMatchObject({ slug: 'ada-lovelace', publishedAt: NOW.toISOString() });
    expect(row).toMatchObject({ slug: 'ada-lovelace', publishedAt: NOW });
    expect(events.emit).toHaveBeenCalledExactlyOnceWith('mentors.profile.published', {
      mentorProfileId: row.id,
      slug: 'ada-lovelace',
    });
  });

  it('refuses an incomplete page, names the missing link, and publishes nothing', async () => {
    const { user, row, events, service } = ownerWith({ ...COMPLETE, publicWorkUrl: null });

    const error = await rejection(service.publish(user.id));

    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 400,
      message: NOT_PUBLISHABLE_MESSAGE,
      fieldErrors: { publicWorkUrl: [PAGE_REQUIREMENT_MESSAGES.publicWorkUrl] },
    });
    expect(row).toMatchObject({ slug: null, publishedAt: null });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('retries a taken slug in a fresh transaction: two equal names get distinct slugs', async () => {
    const first = makeUser();
    const second = makeUser();
    const taken = makeRow(first, { ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });
    const mine = makeRow(second, { ...COMPLETE });
    const { em, service } = setup([taken, mine], [first, second]);

    const own = await service.publish(second.id);

    expect(own.slug).toBe('ada-lovelace-2');
    expect(em.transactions).toBe(2);
    expect(em.clear).toHaveBeenCalledOnce();
  });

  it('skips the reserved slug "me" without a write', async () => {
    const { user, em, service } = ownerWith({ ...COMPLETE, displayName: 'Me' });

    expect((await service.publish(user.id)).slug).toBe('me-2');
    expect(em.clear).not.toHaveBeenCalled();
  });

  it('falls back to "mentor" for a name without letters or digits', async () => {
    const { user, service } = ownerWith({ ...COMPLETE, displayName: '🚀🔥' });

    expect((await service.publish(user.id)).slug).toBe('mentor');
  });

  it('gives up with a retryable 409 after 100 refused candidates', async () => {
    const { user, em, service } = ownerWith({ ...COMPLETE });
    em.transactional.mockImplementation(async () => {
      throw collision();
    });

    expect(await rejection(service.publish(user.id))).toMatchObject({ status: 409, message: SLUG_CONFLICT_MESSAGE });
    expect(em.transactional).toHaveBeenCalledTimes(MAX_SLUG_ATTEMPTS);
  });

  it.each([
    ['another unique constraint', () => collision('mentor_profiles_user_id_unique')],
    ['any other failure', () => new Error('connection lost')],
  ])('does not retry %s', async (_case, failure) => {
    const user = makeUser();
    const row = makeRow(user, { ...COMPLETE });
    const error = failure();
    const { em, service } = setup([row], [user], { failCommit: () => error });

    expect(await rejection(service.publish(user.id))).toBe(error);
    expect(em.transactional).toHaveBeenCalledOnce();
  });

  it('publishes once when called twice (two tabs): one slug, one publish time, one event', async () => {
    const { user, row, events, service } = ownerWith({ ...COMPLETE });

    await service.publish(user.id);
    const again = await service.publish(user.id);

    expect(again).toMatchObject({ slug: 'ada-lovelace', publishedAt: NOW.toISOString() });
    expect(row.slug).toBe('ada-lovelace');
    expect(events.emit).toHaveBeenCalledOnce();
  });

  it('republishes with the same slug after a rename and emits again', async () => {
    const { user, row, events, service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: null });
    row.displayName = 'Ada King';

    const own = await service.publish(user.id);

    expect(own.slug).toBe('ada-lovelace');
    expect(events.emit).toHaveBeenCalledWith('mentors.profile.published', { mentorProfileId: row.id, slug: 'ada-lovelace' });
  });

  it('answers 404 without a profile', async () => {
    const user = makeUser();
    const { service } = setup([], [user]);

    expect(await rejection(service.publish(user.id))).toMatchObject({ status: 404 });
  });
});

describe('MentorProfileService.unpublish', () => {
  it('hides the page and keeps the slug, under the row lock', async () => {
    const { user, row, em, service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });

    const own = await service.unpublish(user.id);

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: user.id }, LOCK);
    expect(own).toMatchObject({ slug: 'ada-lovelace', publishedAt: null });
    expect(row).toMatchObject({ slug: 'ada-lovelace', publishedAt: null });
  });
});

describe('MentorProfileService.getPublicBySlug', () => {
  it('returns exactly the public allowlist of a published page; slots only when offer-ready', async () => {
    const { row, service, slotService } = ownerWith({ ...COMPLETE, ...PRICED, slug: 'ada-lovelace', publishedAt: EARLIER });

    slotService.listPublicFor.mockResolvedValueOnce([]);
    const notReady = await service.getPublicBySlug('ada-lovelace');
    slotService.listPublicFor.mockClear();
    const page = await service.getPublicBySlug('ada-lovelace');

    expect(notReady).toMatchObject({ offerReady: false, prices: null, slots: [] });
    expectProjectionKeys(page, PUBLIC_KEYS);
    expect(page).toEqual({
      slug: 'ada-lovelace',
      displayName: COMPLETE.displayName,
      avatarUrl: AVATAR,
      publicWorkUrl: COMPLETE.publicWorkUrl,
      bio: COMPLETE.bio,
      stackTags: ['python'],
      prices: { price25Cents: 15000, price50Cents: 30000, currency: 'PLN' },
      offerReady: true,
      slots: [SLOT],
    });
    expect(Object.keys(page.slots[0] as object).sort()).toEqual(['bookableLengths', 'id', 'meetsLeadTime', 'startsAt']);
    expect(slotService.listPublicFor).toHaveBeenCalledExactlyOnceWith(row.id, NOW);
    expect(JSON.stringify(page)).not.toMatch(/ada@devmentor\.test|"ada"|initialPublishDueAt|invitation/);
  });

  it('decides offer-readiness from the same slot rows it shows, at one instant, with no second slot query (#28)', async () => {
    const { row, service, slotService } = ownerWith({ ...COMPLETE, ...PRICED, slug: 'ada', publishedAt: EARLIER });
    const soon = { id: 's2', startsAt: '2026-11-20T11:00:00.000Z', meetsLeadTime: false, bookableLengths: [] };
    slotService.listPublicFor.mockResolvedValueOnce([soon]).mockResolvedValueOnce([soon, SLOT]);

    const onlySoon = await service.getPublicBySlug('ada');
    const both = await service.getPublicBySlug('ada');

    expect(onlySoon).toMatchObject({ offerReady: false, prices: null, slots: [] });
    expect(both).toMatchObject({ offerReady: true, slots: [soon, SLOT] });
    expect(slotService.listPublicFor).toHaveBeenNthCalledWith(1, row.id, NOW);
    expect(slotService.countBookable).not.toHaveBeenCalled();
  });

  it('shows no avatar when the user has none', async () => {
    const user = makeUser({ avatarUrl: null });
    const { service } = setup([makeRow(user, { ...COMPLETE, slug: 'ada', publishedAt: EARLIER })], [user]);

    expect((await service.getPublicBySlug('ada')).avatarUrl).toBeNull();
  });

  it.each([
    ['unknown', 'nobody', {}],
    ['malformed', 'Ada Lovelace', {}],
    ['too long', 'a'.repeat(61), {}],
    ['unpublished', 'ada-lovelace', { publishedAt: null }],
    ['incomplete', 'ada-lovelace', { bio: null }],
  ])('answers 404 for an %s page', async (_case, slug, fields) => {
    const { service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER, ...fields });

    expect(await rejection(service.getPublicBySlug(slug))).toMatchObject({ status: 404, message: PAGE_NOT_FOUND_MESSAGE });
    await expect(service.findPublicBySlug(slug)).resolves.toBeNull();
  });

  it('answers 404 when the owner no longer holds mentor, or is not loaded (fail closed)', async () => {
    const revoked = makeUser({ roles: ['mentee'] });
    const orphan = makeRow(makeUser(), { ...COMPLETE, slug: 'orphan', publishedAt: EARLIER });
    orphan.user = { id: 'x', getEntity: () => undefined } as unknown as MentorProfile['user'];
    const { service } = setup(
      [makeRow(revoked, { ...COMPLETE, slug: 'revoked', publishedAt: EARLIER }), orphan],
      [revoked],
    );

    expect(await rejection(service.getPublicBySlug('revoked'))).toMatchObject({ status: 404 });
    expect(await rejection(service.getPublicBySlug('orphan'))).toMatchObject({ status: 404 });
  });
});

describe('MentorProfileService.updatePrices (#24)', () => {
  it('saves both prices exactly in cents under the row lock and answers the owner view', async () => {
    const { user, row, em, service } = ownerWith({ ...COMPLETE });

    const own = await service.updatePrices(user.id, { price25: '150', price50: '300.50' });

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: user.id }, LOCK);
    expect(row).toMatchObject({ price25Cents: 15000, price50Cents: 30050 });
    expect(own.prices).toEqual({ price25Cents: 15000, price50Cents: 30050, currency: 'PLN' });
    expect(own.offerReadiness.filter((item) => item.key.startsWith('price')).every((item) => item.met)).toBe(true);
  });

  it('accepts prices exactly at the bounds', async () => {
    const { user, row, service } = ownerWith();

    await service.updatePrices(user.id, { price25: '50', price50: '600.00' });

    expect(row).toMatchObject({ price25Cents: 5000, price50Cents: 60000 });
  });

  it('names every field outside its range with the allowed range and saves nothing', async () => {
    const { user, row, service } = ownerWith({ price25Cents: 10000, price50Cents: 20000 });

    const both = await rejection(service.updatePrices(user.id, { price25: '49.99', price50: '600.01' }));
    const one = await rejection(service.updatePrices(user.id, { price25: '150', price50: '99999999999999999999' }));

    expect(both).toMatchObject({
      status: 400,
      message: PRICES_OUT_OF_BOUNDS_MESSAGE,
      fieldErrors: { price25: [allowedRange(BOUNDS['25'], 'PLN')], price50: [allowedRange(BOUNDS['50'], 'PLN')] },
    });
    expect(Object.keys((one as { fieldErrors: object }).fieldErrors)).toEqual(['price50']);
    expect(row).toMatchObject({ price25Cents: 10000, price50Cents: 20000 });
    expect(allowedRange(BOUNDS['25'], 'PLN').replace(/\s/g, ' ')).toBe('Allowed: PLN 50.00–PLN 300.00');
  });

  it('answers 503 when settings are missing and writes nothing', async () => {
    const user = makeUser();
    const row = makeRow(user);
    const { em, service } = setup([row], [user], {}, false);

    expect(await rejection(service.updatePrices(user.id, { price25: '150', price50: '300' }))).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it('answers 404 without a profile', async () => {
    const user = makeUser();
    const { service } = setup([], [user]);

    expect(await rejection(service.updatePrices(user.id, { price25: '150', price50: '300' }))).toMatchObject({ status: 404 });
  });

  it('keeps stored prices when bounds are tightened, reports them unmet and still shows them to the owner', async () => {
    const { user, service } = ownerWith({ ...PRICED, price50Cents: 70000 });

    const own = await service.getOwn(user.id);

    expect(own.prices).toEqual({ price25Cents: 15000, price50Cents: 70000, currency: 'PLN' });
    expect(own.offerReadiness.find((item) => item.key === 'price50')).toEqual({ key: 'price50', met: false });
  });

  it('without settings: no prices, no bounds, settings unmet, and the public page is not offer-ready', async () => {
    const user = makeUser();
    const row = makeRow(user, { ...COMPLETE, ...PRICED, slug: 'ada', publishedAt: EARLIER });
    const { service, slotService } = setup([row], [user], {}, false);
    slotService.countBookable.mockResolvedValue(3);

    const own = await service.getOwn(user.id);
    const page = await service.getPublicBySlug('ada');

    expect(own).toMatchObject({ prices: null, priceBounds: null });
    expect(own.offerReadiness.find((item) => item.key === 'settings')).toEqual({ key: 'settings', met: false });
    expect(page).toMatchObject({ prices: null, offerReady: false, slots: [] });
  });
});
