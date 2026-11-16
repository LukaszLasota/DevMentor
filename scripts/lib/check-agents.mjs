// Agent-context gate (lesson 10, spec .ai/specs/2026-11-16-agent-context-routing.md): keeps the agent
// instruction files small, their routes valid and every CLAUDE.md a bare import of its AGENTS.md.
//
// 1. Budgets: root AGENTS.md <= 150 lines, each packages/*/AGENTS.md <= 120 lines (warning at 80%).
//    packages/app/AGENTS.md counts only our part below the leading `next dev` blocks
//    (`<!-- BEGIN:nextjs-agent-… -->` … `<!-- END:… -->`, see MANAGED_BLOCKS): they are not ours to trim.
//    Any other marker, in any file, is counted like ordinary text.
// 2. Routes: every backticked repo path in an AGENTS.md must exist, and every row of the root
//    `| Task | Read |` table must route to at least one such path. In a package file, a bare or
//    section-relative file name (`errors.ts`, `forms/CrudForm.tsx`, `invitation/`) must match a file of
//    that package whose path ends with `/<name>` (brace groups `{a,b}` are expanded, each must exist).
// 3. Sections: `path.md § Name` (or `§2`) after a markdown path must match a heading (warning only).
// 4. Every CLAUDE.md is exactly `@AGENTS.md` (one trailing newline optional) next to an AGENTS.md; every
//    packages/*/AGENTS.md has one. A package (`packages/<x>/package.json`) without AGENTS.md is a warning:
//    a unit gets a file only when it has package-specific rules (task-router), but it must not go unnoticed.
// Line endings are normalised (CRLF → LF) before any text is compared, counted or parsed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT_FILE = 'AGENTS.md';
export const ROOT_BUDGET = 150;
export const PACKAGE_BUDGET = 120;
export const WARN_RATIO = 0.8;
export const CLAUDE_CONTENT = '@AGENTS.md\n';
/** The only file with managed blocks, and the block names `next dev` writes into it
 * (`node_modules/next/dist/server/lib/generate-agent-files.js`). */
export const MANAGED_FILE = 'packages/app/AGENTS.md';
export const MANAGED_BLOCKS = ['nextjs-agent-rules', 'nextjs-agent-feedback'];

/** Backticked tokens with these prefixes are repo paths and must exist. */
export const PATH_PREFIXES = ['.ai/', '.github/', '.claude/', '.agents/', 'packages/', 'docs/', 'scripts/'];
/** Bare file names with these extensions are root files — checked in the root AGENTS.md only (in package
 * files a bare name like `errors.ts` is relative to the section that lists it). */
const ROOT_FILE_PATTERN = /^[\w.-]+\.(?:md|json|mjs|cjs|mts|ts|js|ya?ml|toml)$/;
/** Placeholders and patterns, not paths: `<concept>`, `YYYY-MM-DD`, `{a,b}`, globs, ellipses. */
const PLACEHOLDER_PATTERN = /[<>{}*…]|YYYY|\.\.\./;
/** A dated example name such as `2026-10-20-user-login.md` (naming rule); real references carry their folder. */
const NAMING_EXAMPLE_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
/** A package file name: ends in a source/doc extension or `/` (`try/catch`, `process.env` are not names). */
const PACKAGE_NAME_PATTERN = /^[\w([-][\w.()[\]-]*(?:\/[\w.()[\]-]+)*(?:\/|\.(?:ts|tsx|mts|mjs|js|json|md|css|ya?ml))$/;
/** Paths mentioned on purpose although they do not exist (each with its reason). Not listed because no
 * check ever reaches them: `.codex/` (no checked prefix, not a root file name); `.mcp.json` exists and is
 * checked as a root file name. */
export const ALLOWLIST = new Map([
  // Not in the repo: a preventive CODEOWNERS entry. Locally the Claude Code sandbox mounts a placeholder at this
  // path, so an existence check passes on the agent's machine and fails in CI — never trust a local check for it.
  ['.mcp.json', 'preventive CODEOWNERS entry; no project MCP config'],
  ['src/app/layout.tsx', 'named as not existing (one root layout per route group)'],
  ['packages/app/src/app/layout.tsx', 'named as not existing (one root layout per route group)'],
]);
/** Directories never searched for CLAUDE.md: dependencies, build output, installed skills, course material. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.agents', 'coverage', 'storybook-static', 'prototypes']);
const SKIP_DIR_PATTERN = /^lekcja-/;

/** The text with CRLF (and lone CR) line endings turned into LF. */
export function normalizeEol(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** Dotenv files are never read and may be named without existing (`.env`, `.env.local`, `.env.example`…). */
function isEnvFile(token) {
  return /^\.env(?:\.|$)/.test(token.split('/').at(-1));
}

/**
 * Classifies one backticked token: the repo path to check, or null when it is not a checkable path.
 * `isRoot` enables bare root file names (`SDLC.md`, `vitest.config.mts`).
 */
export function pathOf(token, isRoot) {
  if (/\s/.test(token) || PLACEHOLDER_PATTERN.test(token)) return null;
  if (isEnvFile(token) || ALLOWLIST.has(token)) return null;
  if (PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) return token;
  if (isRoot && ROOT_FILE_PATTERN.test(token) && !NAMING_EXAMPLE_PATTERN.test(token)) return token;
  return null;
}

/** Expands one `{a,b}` brace group (`f/{A,B}.tsx` → `f/A.tsx`, `f/B.tsx`); other tokens are returned as is. */
export function expandBraces(token) {
  const match = token.match(/^([^{}]*)\{([^{}]+)\}([^{}]*)$/);
  return match ? match[2].split(',').map((part) => `${match[1]}${part.trim()}${match[3]}`) : [token];
}

/**
 * The package-relative file names of one backticked token in a package AGENTS.md, or null. Repo paths
 * (handled by `pathOf`), dependency paths (`node_modules/…`), scoped imports (`@devmentor/core/http`),
 * dot names, URLs (`/api/*`), calls (`NextResponse.json()`) and placeholders are not package file names.
 */
export function packageNamesOf(token) {
  if (/\s/.test(token) || token.startsWith('node_modules/') || pathOf(token, false) || isEnvFile(token)) return null;
  if (ALLOWLIST.has(token)) return null;
  const names = expandBraces(token);
  if (names.some((name) => PLACEHOLDER_PATTERN.test(name) || !PACKAGE_NAME_PATTERN.test(name))) return null;
  return names;
}

/** Every package file name in a package AGENTS.md text, with its line. */
export function findPackageNames(text) {
  const names = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      for (const name of packageNamesOf(match[1]) ?? []) names.push({ line: index + 1, name });
    }
  });
  return names;
}

/** True when one of the package files (repo-relative paths) ends with `/<name>`, or lies in directory `<name>`. */
export function packageHasName(files, name) {
  return name.endsWith('/') ? files.some((file) => file.includes(`/${name}`)) : files.some((file) => file.endsWith(`/${name}`));
}

/** Every checkable path in a markdown text, with its line and an optional `§` section reference. */
export function findReferences(text, isRoot) {
  const references = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const path = pathOf(match[1], isRoot);
      if (!path) continue;
      const after = line.slice(match.index + match[0].length);
      // `§ Name` ends at a comma, a pipe, an opening parenthesis or a sentence-ending period.
      const section = path.endsWith('.md') ? after.match(/^\s*§\s*([^,|()]+?)\s*\.?\s*(?=[,|(]|$)/)?.[1] : undefined;
      references.push({ line: index + 1, path, section });
    }
  });
  return references;
}

/** Rows of the root `| Task | Read |` table: `{ line, task, read }`, or null when the table is missing. */
export function routingRows(text) {
  const lines = text.split('\n');
  const header = lines.findIndex((line) => /^\|\s*Task\s*\|\s*Read\s*\|\s*$/.test(line));
  if (header === -1) return null;
  const rows = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i += 1) {
    const [, task, read] = lines[i].split('|').map((cell) => cell.trim());
    rows.push({ line: i + 1, task, read });
  }
  return rows;
}

/**
 * Lines that count against the budget: all of them, except in `MANAGED_FILE`, where the `next dev`
 * blocks at its top (known names only, each closed by its own END marker, blank lines between) are skipped.
 */
export function countedLines(text, path = '') {
  const lines = normalizeEol(text).replace(/\n$/, '').split('\n');
  let start = 0;
  if (path === MANAGED_FILE) {
    for (let i = 0; i < lines.length; i += 1) {
      const name = lines[i].trim().match(/^<!-- BEGIN:([\w-]+) -->$/)?.[1];
      if (lines[i].trim() === '') continue;
      if (!MANAGED_BLOCKS.includes(name)) break;
      const end = lines.findIndex((line, j) => j > i && line.trim() === `<!-- END:${name} -->`);
      if (end === -1) break;
      i = end;
      start = end + 1;
    }
  }
  return { count: lines.length - start, ownPart: start > 0 };
}

/** True when a markdown heading of `text` matches the section name (`2` matches `## 2. …`). */
export function hasHeading(text, name) {
  const headings = normalizeEol(text)
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#+\s*/, ''));
  if (/^\d+$/.test(name)) return headings.some((heading) => heading.startsWith(`${name}.`));
  return headings.some((heading) => heading.toLowerCase().includes(name.toLowerCase()));
}

/** Checks one AGENTS.md: budget, existing paths, section headings and (root only) the routing table. */
export function checkAgentsFile(path, rawText, { exists, read, packageFiles }) {
  const text = normalizeEol(rawText);
  const isRoot = path === ROOT_FILE;
  const budget = isRoot ? ROOT_BUDGET : PACKAGE_BUDGET;
  const errors = [];
  const warnings = [];
  const { count, ownPart } = countedLines(text, path);
  const lines = `${count}/${budget} lines${ownPart ? ' (own part)' : ''}`;

  if (count > budget) errors.push(`${path}: ${count} lines, budget ${budget}`);
  else if (count >= budget * WARN_RATIO) warnings.push(`${path}: ${count} lines, ${Math.round((count / budget) * 100)}% of budget ${budget}`);

  const references = findReferences(text, isRoot);
  for (const { line, path: target, section } of references) {
    if (!exists(target)) {
      errors.push(`${path}:${line}: missing path ${target}`);
    } else if (section && !hasHeading(read(target), section)) {
      warnings.push(`${path}:${line}: ${target} has no heading "${section}"`);
    }
  }

  const pkg = path.match(/^packages\/([^/]+)\/AGENTS\.md$/)?.[1];
  const names = pkg ? findPackageNames(text) : [];
  if (names.length > 0) {
    const files = packageFiles(pkg);
    for (const { line, name } of names) {
      if (!packageHasName(files, name)) errors.push(`${path}:${line}: missing file ${name} in packages/${pkg}`);
    }
  }

  if (isRoot) {
    const rows = routingRows(text);
    if (rows === null) errors.push(`${path}: no | Task | Read | routing table`);
    for (const row of rows ?? []) {
      if (findReferences(row.read, true).length === 0) errors.push(`${path}:${row.line}: route "${row.task}" names no repo path`);
    }
  }

  const counted = `${references.length} paths${names.length ? `, ${names.length} package names` : ''}`;
  return { summary: `${path}  ${lines}  ${counted}`, errors, warnings };
}

/** Checks the CLAUDE.md files: bare `@AGENTS.md` import next to an AGENTS.md, and one per package AGENTS.md. */
export function checkClaudeFiles(claudeFiles, agentsFiles, { exists, read }) {
  const errors = [];
  for (const path of claudeFiles) {
    if (normalizeEol(read(path)).replace(/\n$/, '') !== CLAUDE_CONTENT.trimEnd()) errors.push(`${path}: must contain exactly "@AGENTS.md" and a newline`);
    const sibling = path.replace(/CLAUDE\.md$/, 'AGENTS.md');
    if (!exists(sibling)) errors.push(`${path}: imports ${sibling}, which does not exist`);
  }
  for (const path of agentsFiles) {
    const sibling = path.replace(/AGENTS\.md$/, 'CLAUDE.md');
    if (!claudeFiles.includes(sibling)) errors.push(`${path}: no sibling ${sibling} (Claude Code reads AGENTS.md through it)`);
  }
  return errors;
}

/** Warnings for packages (`packages/<x>/package.json`) without an AGENTS.md. */
export function checkPackages(packages, { exists }) {
  return packages
    .filter((pkg) => !exists(`packages/${pkg}/AGENTS.md`))
    .map((pkg) => `packages/${pkg}: no package rules — add packages/${pkg}/AGENTS.md if it has package-specific rules`);
}

/** Every directory under packages/ with a package.json (a workspace package). */
export function listPackages(cwd, fs = { existsSync, readdirSync }) {
  return fs
    .readdirSync(join(cwd, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(join(cwd, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

/** The root AGENTS.md plus every packages/<name>/AGENTS.md. */
export function listAgentsFiles(cwd, fs = { existsSync, readdirSync }) {
  const packages = fs
    .readdirSync(join(cwd, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/AGENTS.md`)
    .filter((path) => fs.existsSync(join(cwd, path)))
    .sort();
  return [ROOT_FILE, ...packages];
}

/** Every file below `dir` (repo-relative) accepted by `accept`, skipping dependencies, build output and course material. */
export function listFiles(cwd, dir, accept, fs = { readdirSync }) {
  const out = [];
  for (const entry of fs.readdirSync(join(cwd, dir), { withFileTypes: true })) {
    const child = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !SKIP_DIR_PATTERN.test(entry.name)) out.push(...listFiles(cwd, child, accept, fs));
    } else if (accept(entry.name)) {
      out.push(child);
    }
  }
  return out.sort();
}

/** Every CLAUDE.md below `dir` (repo-relative). */
export function listClaudeFiles(cwd, dir = '', fs = { readdirSync }) {
  return listFiles(cwd, dir, (name) => name === 'CLAUDE.md', fs);
}

/** Runs the gate and returns the process exit code (0 ok, possibly with warnings; 1 errors). */
export function main({
  cwd = process.cwd(),
  agentsFiles = () => listAgentsFiles(cwd),
  claudeFiles = () => listClaudeFiles(cwd),
  packages = () => listPackages(cwd),
  exists = (path) => existsSync(join(cwd, path)),
  read = (path) => readFileSync(join(cwd, path), 'utf8'),
  packageFiles = (pkg) => listFiles(cwd, `packages/${pkg}`, () => true),
  log = console.log,
  logError = console.error,
} = {}) {
  const errors = [];
  const warnings = [];
  const agents = agentsFiles();

  for (const path of agents) {
    if (!exists(path)) {
      errors.push(`${path}: missing`);
      continue;
    }
    const result = checkAgentsFile(path, read(path), { exists, read, packageFiles });
    log(`  ${result.summary}${result.errors.length ? '' : ' ok'}`);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const claude = claudeFiles();
  const claudeErrors = checkClaudeFiles(claude, agents.filter(exists), { exists, read });
  log(`  ${claude.length} CLAUDE.md files → @AGENTS.md${claudeErrors.length ? '' : ' ok'}`);
  errors.push(...claudeErrors);

  warnings.push(...checkPackages(packages(), { exists }));

  for (const warning of warnings) log(`warning: ${warning}`);
  for (const error of errors) logError(`error: ${error}`);

  const counts = `${agents.length} AGENTS.md files, ${claude.length} CLAUDE.md files`;
  if (errors.length > 0) {
    logError(`check:agents: ${counts}, ${errors.length} error(s).`);
    return 1;
  }
  log(`check:agents: ${counts}, all ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
  return 0;
}
