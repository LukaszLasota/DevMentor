import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;
// Pure modules outside domain/ that domain code may use (no `server-only`, no I/O).
const ALLOWED_OUTSIDE = new Set(['http/errors.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('core/src/domain', () => {
  it('exposes the vocabulary, slug and readiness primitives', async () => {
    const domain = await import('./index');

    expect(Object.keys(domain).sort()).toEqual(
      [
        'MAX_STACK_TAGS',
        'NOT_READY_MESSAGE',
        'RESERVED_SLUGS',
        'SLUG_FALLBACK',
        'SLUG_MAX_LENGTH',
        'SESSION_LENGTHS',
        'StackTags',
        'defineReadiness',
        'defineVocabulary',
        'isReservedSlug',
        'priceField',
        'slugCandidate',
        'slugify',
      ].sort(),
    );
  });

  it('stays client-safe: imports only zod, its own files and pure error classes', () => {
    const coreSrc = resolve(root, '..');

    for (const file of sourceFiles(root)) {
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const specifier = match[1] ?? match[2];
        const target = specifier.startsWith('.') ? relative(coreSrc, resolve(dirname(file), specifier)) : specifier;
        const allowed =
          specifier === 'zod' || target.startsWith('domain/') || ALLOWED_OUTSIDE.has(`${target}.ts`);

        expect({ file: relative(root, file), specifier, allowed }).toEqual({
          file: relative(root, file),
          specifier,
          allowed: true,
        });
      }
    }
  });
});
