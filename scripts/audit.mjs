// Validation-gate audit: fails on high/critical advisories unless explicitly
// allowlisted (with a reason and review date) in audit-allowlist.json.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const allowlist = JSON.parse(readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

let output;
try {
  output = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON report is still on stdout.
  output = error.stdout;
}

const report = JSON.parse(output);
const advisories = new Map();

for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === 'object' && BLOCKING.has(via.severity)) {
      advisories.set(via.url.split('/').pop(), { title: via.title, package: via.name, severity: via.severity });
    }
  }
}

const expired = allowlist.filter((entry) => entry.reviewBy < today);
const blocking = [...advisories].filter(([id]) => !allowlist.some((entry) => entry.id === id));

for (const entry of expired) {
  console.error(`Allowlist entry ${entry.id} (${entry.package}) passed its review date ${entry.reviewBy}; re-check it.`);
}

for (const [id, advisory] of blocking) {
  console.error(`${advisory.severity.toUpperCase()} ${id} ${advisory.package}: ${advisory.title}`);
}

if (expired.length > 0 || blocking.length > 0) {
  process.exit(1);
}

console.log(`npm audit: no blocking advisories (${advisories.size} allowlisted).`);
