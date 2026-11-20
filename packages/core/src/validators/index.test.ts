import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => match[1] ?? match[2]);
}

describe('@devmentor/core/validators', () => {
  it('exposes the auth and mentor schemas, limits and the stack-tag vocabulary', async () => {
    const validators = await import('./index');

    expect(Object.keys(validators).sort()).toEqual(
      [
        'BIO_MAX',
        'DISPLAY_NAME_MAX',
        'EMAIL_MAX_LENGTH',
        'MAX_STACK_TAGS',
        'PUBLIC_WORK_URL_MAX',
        'StackTags',
        'isPublicWorkUrl',
        'isWholeMinuteUtc',
        'slotCreateSchema',
        'bookingCancelSchema',
        'ANSWER_MAX',
        'ANSWER_MIN',
        'MESSAGE_MAX',
        'sessionAnswerSchema',
        'sessionMessageSchema',
        'sessionReadQuerySchema',
        'bookingReportSchema',
        'REPORT_MESSAGE_MAX',
        'REPORT_MESSAGE_MIN',
        'bookingStartSchema',
        'mentorProfileUpdateSchema',
        'AMOUNT_MESSAGE',
        'mentorPricesUpdateSchema',
        'mentorListQuerySchema',
        'UNKNOWN_TAG_MESSAGE',
        'PASSWORD_MAX_LENGTH',
        'PASSWORD_MIN_LENGTH',
        'RETURN_TO_MAX_LENGTH',
        'TOKEN_MAX_LENGTH',
        'registerSchema',
        'resendVerificationSchema',
        'setPasswordSchema',
        'signInSchema',
      ].sort(),
    );
  });

  it('stays client-safe: imports only zod, files inside validators/ and the client-safe domain/', () => {
    const files = sourceFiles(root);
    expect(files.length).toBeGreaterThan(1);

    for (const file of files) {
      for (const specifier of importsOf(file)) {
        const target = relative(root, resolve(dirname(file), specifier));
        const inside = specifier.startsWith('.') && !target.startsWith(`..${sep}`);
        // domain/ guards its own imports (domain/index.test.ts).
        const domain = specifier.startsWith('.') && target.startsWith(`..${sep}domain${sep}`);
        expect({ file: relative(root, file), specifier, allowed: specifier === 'zod' || inside || domain }).toEqual({
          file: relative(root, file),
          specifier,
          allowed: true,
        });
      }
    }
  });
});
