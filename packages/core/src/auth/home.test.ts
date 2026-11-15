import { describe, expect, it } from 'vitest';
import { homeFor } from './home';

describe('homeFor', () => {
  it.each([
    [['mentee'], '/mentors'],
    [['mentee', 'mentor'], '/mentor'],
    [['mentor'], '/mentor'],
    [['mentee', 'operator'], '/admin'],
    [['mentee', 'mentor', 'operator'], '/admin'],
  ] as const)('%j → %s', (roles, home) => {
    expect(homeFor(roles)).toBe(home);
  });
});
