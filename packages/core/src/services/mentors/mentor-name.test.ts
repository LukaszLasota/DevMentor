import { describe, expect, it } from 'vitest';
import { MENTOR_NAME_FALLBACK, mentorNameForMentee } from './mentor-name';

describe('mentorNameForMentee', () => {
  it('keeps a display name', () => {
    expect(mentorNameForMentee('Ada')).toBe('Ada');
  });

  it('falls back for a missing or blank name', () => {
    expect(MENTOR_NAME_FALLBACK).toBe('Your mentor');
    expect(mentorNameForMentee(null)).toBe(MENTOR_NAME_FALLBACK);
    expect(mentorNameForMentee(undefined)).toBe(MENTOR_NAME_FALLBACK);
    expect(mentorNameForMentee('   ')).toBe(MENTOR_NAME_FALLBACK);
  });
});
