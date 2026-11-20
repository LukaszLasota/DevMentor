import { randomUUID } from 'node:crypto';
import { LockMode, MENTOR_PROFILE_SLUG_KEY, MentorProfile, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { isAppError } from '../../http/errors';
import {
  MAX_SLUG_ATTEMPTS,
  MentorProfileService,
  NOT_PUBLISHABLE_MESSAGE,
  PAGE_NOT_FOUND_MESSAGE,
  PROFILE_NOT_FOUND_MESSAGE,
  PUBLISHED_EDIT_MESSAGE,
  SLUG_CONFLICT_MESSAGE,
} from './mentor-profile.service';
import type { MentorProfileUpdateInput } from '../../validators/mentors/mentor-profile-update.schema';
import { PAGE_REQUIREMENT_MESSAGES, type MentorPageRequirement } from './readiness';

const NOW = new Date('2026-11-20T10:00:00.000Z');
const EARLIER = new Date('2026-11-01T08:00:00.000Z');
const DUE = new Date('2026-11-28T12:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const AVATAR = 'https://avatars.example/ada.png';

const PUBLIC_KEYS = ['avatarUrl', 'bio', 'displayName', 'publicWorkUrl', 'slug', 'stackTags'];
const OWNER_KEYS = [...PUBLIC_KEYS, 'initialPublishDueAt', 'publishedAt', 'readiness'].sort();

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

function setup(rows: MentorProfile[], users: User[], options: Parameters<typeof fakeEm>[2] = {}) {
  const em = fakeEm(rows, users, options);
  const events = { emit: vi.fn(async () => undefined) };
  const service = new MentorProfileService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
  });

  return { em, events, service };
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
    });
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
  it('returns exactly the public allowlist of a published page', async () => {
    const { service } = ownerWith({ ...COMPLETE, slug: 'ada-lovelace', publishedAt: EARLIER });

    const page = await service.getPublicBySlug('ada-lovelace');

    expectProjectionKeys(page, PUBLIC_KEYS);
    expect(page).toEqual({
      slug: 'ada-lovelace',
      displayName: COMPLETE.displayName,
      avatarUrl: AVATAR,
      publicWorkUrl: COMPLETE.publicWorkUrl,
      bio: COMPLETE.bio,
      stackTags: ['python'],
    });
    expect(JSON.stringify(page)).not.toMatch(/ada@devmentor\.test|"ada"|initialPublishDueAt|invitation/);
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
