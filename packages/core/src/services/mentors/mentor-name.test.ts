import { describe, expect, it } from 'vitest';
import { MENTOR_NAME_FALLBACK, mentorNameForMentee } from './mentor-name';

describe('mentorNameForMentee', () => {
  it('keeps a display name', () => {
    expect(mentorNameForMentee('Ada')).toBe('Ada');
  });

  it.each([null, undefined, '', '   '])('falls back to "Your mentor" for %j', (name) => {
    expect(mentorNameForMentee(name)).toBe(MENTOR_NAME_FALLBACK);
    expect(MENTOR_NAME_FALLBACK).toBe('Your mentor');
  });
});
