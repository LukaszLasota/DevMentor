import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACK_TAGS } from '@devmentor/db';
import { describe, expect, it } from 'vitest';
import { MAX_STACK_TAGS, StackTags } from './stack-tags';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../db/src/migrations');

/** Every `<table>.stack_tags <@ array[...]` literal the committed migrations write, per CHECK name. */
function stackTagChecks(): Map<string, string[]> {
  const checks = new Map<string, string[]>();
  const pattern = /constraint "(\w+_stack_tags_check)" check \([^;]*?stack_tags <@ array\[([^\]]*)\]::text\[\]/g;

  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.ts')).sort()) {
    for (const match of readFileSync(join(migrationsDir, file), 'utf8').matchAll(pattern)) {
      checks.set(
        match[1],
        match[2].split(',').map((tag) => tag.trim().replace(/^'|'$/g, '')),
      );
    }
  }

  return checks;
}

describe('StackTags (D24)', () => {
  it('offers exactly TypeScript, React, Python and AI agents', () => {
    expect(StackTags.options()).toEqual([
      { value: 'typescript', label: 'TypeScript' },
      { value: 'react', label: 'React' },
      { value: 'python', label: 'Python' },
      { value: 'ai-agents', label: 'AI agents' },
    ]);
    expect(MAX_STACK_TAGS).toBe(4);
  });

  it('refuses any other value through its schema', () => {
    expect(StackTags.schema().safeParse('rust').success).toBe(false);
    expect(StackTags.schema().safeParse('TypeScript').success).toBe(false);
  });

  it('matches the hand-written CHECK literals of invitations and mentor_profiles (drift test)', () => {
    const checks = stackTagChecks();

    expect([...checks.keys()].sort()).toEqual(['invitations_stack_tags_check', 'mentor_profiles_stack_tags_check']);
    for (const tags of checks.values()) {
      expect(tags).toEqual([...StackTags.keys]);
    }
    // The entity type and the invitations CHECK builder in @devmentor/db use their own copy.
    expect([...STACK_TAGS]).toEqual([...StackTags.keys]);
  });
});
