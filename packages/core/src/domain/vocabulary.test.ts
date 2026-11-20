import { describe, expect, it } from 'vitest';
import { defineVocabulary } from './vocabulary';

const Colors = defineVocabulary([
  { key: 'dark-blue', label: 'Dark blue' },
  { key: 'red', label: 'Red' },
]);

describe('defineVocabulary', () => {
  it('lists keys, entries, labels and picker options in declaration order', () => {
    expect(Colors.keys).toEqual(['dark-blue', 'red']);
    expect(Colors.entries.map((entry) => entry.label)).toEqual(['Dark blue', 'Red']);
    expect(Colors.label('red')).toBe('Red');
    expect(Colors.options()).toEqual([
      { value: 'dark-blue', label: 'Dark blue' },
      { value: 'red', label: 'Red' },
    ]);
  });

  it('finds a key by key or label, ignoring case, spaces and dashes', () => {
    expect(Colors.find(' DARK BLUE ')).toBe('dark-blue');
    expect(Colors.find('dark_blue')).toBe('dark-blue');
    expect(Colors.find('Red')).toBe('red');
    expect(Colors.find('green')).toBeUndefined();
  });

  it('normalizes a selection to distinct keys in declaration order', () => {
    expect(Colors.normalize(['red', 'dark-blue', 'red'])).toEqual(['dark-blue', 'red']);
  });

  it('builds a Zod enum over the keys, with an optional message', () => {
    expect(Colors.schema().parse('red')).toBe('red');
    expect(Colors.schema().safeParse('green').success).toBe(false);
    expect(Colors.schema('Pick a listed colour.').safeParse('green').error?.issues[0]?.message).toBe(
      'Pick a listed colour.',
    );
  });
});
