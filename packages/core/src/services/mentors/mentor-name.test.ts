import { describe, expect, it } from 'vitest';
import { MENTOR_NAME_FALLBACK, mentorNameForMentee, mentorNameForOperator, mentorNameInSentence } from './mentor-name';

describe('mentor names (#85, #87)', () => {
  it('keeps a display name everywhere', () => {
    expect(mentorNameForMentee('Ada')).toBe('Ada');
    expect(mentorNameInSentence('Ada')).toBe('Ada');
    expect(mentorNameForOperator('Ada', 'ada@example.com')).toBe('Ada');
  });

  it.each([null, undefined, '', '   '])('falls back for %j', (name) => {
    expect(MENTOR_NAME_FALLBACK).toBe('Your mentor');
    expect(mentorNameForMentee(name)).toBe('Your mentor');
    expect(mentorNameInSentence(name)).toBe('your mentor');
    expect(mentorNameForOperator(name, 'ada@example.com')).toBe('ada@example.com');
  });
});
