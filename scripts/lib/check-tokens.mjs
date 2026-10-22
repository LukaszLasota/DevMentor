// Design-token gate (lesson 06): fails when UI code holds a value that should be a token —
// hex/rgb/hsl/oklch colours, Tailwind palette classes, or arbitrary Tailwind values.
// Only packages/ui/src/tokens.css may hold raw values.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOTS = ['packages/app/src', 'packages/ui/src', 'packages/ui/stories', 'packages/ui/.storybook'];
export const TOKEN_FILE = 'packages/ui/src/tokens.css';
// Teaching pages quote the forbidden values on purpose ("What to avoid"); they are prose, not UI code.
export const DOCS_DIR = 'packages/ui/stories/design-system/';
const EXTENSIONS = ['.ts', '.tsx', '.css', '.mdx'];
const SKIP_DIRS = new Set(['node_modules', 'storybook-static']);

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

export const RULES = [
  { name: 'raw colour', pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/ },
  {
    name: 'Tailwind palette class',
    pattern: new RegExp(
      `(?:^|[^-\\w])(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|shadow)-(?:(?:${PALETTE})-\\d{2,3}|white|black)\\b`,
    ),
  },
  { name: 'Tailwind arbitrary value', pattern: /-\[[0-9.]+(?:px|rem|em)\]/ },
];

/** Files that are scanned: UI sources outside tests, build output and the token file. */
export function isScanned(path) {
  if (path === TOKEN_FILE || path.startsWith(DOCS_DIR)) return false;
  if (/\.test\.(?:ts|tsx|mjs)$/.test(path)) return false;
  return EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** Findings for one file's text: one entry per offending line and rule. */
export function findViolations(path, text) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    for (const rule of RULES) {
      const match = line.match(rule.pattern);
      // Drop the boundary character the palette rule consumes before the class name.
      if (match) findings.push({ path, line: index + 1, rule: rule.name, match: match[0].trim().replace(/^[^-\w#]/, '') });
    }
  });
  return findings;
}

/** Recursively lists files below `dir`, relative to `cwd`; a missing root is reported, not skipped. */
export function listFiles(dir, cwd, fs = { readdirSync, statSync }) {
  const absolute = join(cwd, dir);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })) throw new Error(`Path not found: ${dir}`);
  const out = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const child = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(child, cwd, fs));
    else out.push(relative(cwd, join(cwd, child)));
  }
  return out;
}

/** Runs the gate and returns the process exit code (0 clean, 1 findings, 2 broken setup). */
export function main({
  cwd = process.cwd(),
  roots = ROOTS,
  list = (dir) => listFiles(dir, cwd),
  read = (path) => readFileSync(join(cwd, path), 'utf8'),
  log = console.log,
  logError = console.error,
} = {}) {
  let files;
  try {
    files = roots.flatMap((root) => list(root)).filter(isScanned);
  } catch (error) {
    logError(`check:tokens could not scan: ${error.message}`);
    return 2;
  }

  const findings = files.flatMap((path) => findViolations(path, read(path)));
  for (const f of findings) logError(`${f.path}:${f.line}  ${f.rule}: ${f.match}`);

  if (findings.length > 0) {
    logError(`check:tokens: ${findings.length} value(s) outside ${TOKEN_FILE}. Use semantic tokens instead.`);
    return 1;
  }
  log(`check:tokens: ${files.length} files clean.`);
  return 0;
}
