#!/bin/sh
# Lesson 16: one SAST (Semgrep CE) and one DAST (OWASP ZAP baseline, passive) run against the LOCAL test env only.
# Owner-run (Docker is outside the agent sandbox): sh .ai/scripts/sec-scan.sh [sast|dast|all]
# Reports land in .ai/qa/lesson-16-sast-dast/ (semgrep.json, semgrep.txt, zap.html, zap.json, zap.txt).
set -eu
cd "$(dirname "$0")/../.."
OUT="$PWD/.ai/qa/lesson-16-sast-dast"
mkdir -p "$OUT"
WHAT="${1:-all}"
SEMGREP_IMAGE="${SEMGREP_IMAGE:-semgrep/semgrep:latest}"
ZAP_IMAGE="${ZAP_IMAGE:-zaproxy/zap-stable:latest}"
# Record exactly which image ran, so a rerun can pin it (SEMGREP_IMAGE=semgrep/semgrep@sha256:... sh .ai/scripts/sec-scan.sh).
digest() { docker pull -q "$1" >/dev/null && docker image inspect --format '{{index .RepoDigests 0}}' "$1"; }

if [ "$WHAT" = sast ] || [ "$WHAT" = all ]; then
  echo "== SAST: Semgrep CE on packages/ (telemetry off, results stay local)"
  digest "$SEMGREP_IMAGE" > "$OUT/semgrep.image"
  # Rulesets: TypeScript, React, Next.js, Node.js, OWASP Top 10, secrets. --metrics=off: nothing about the code leaves the machine.
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/src:ro" -v "$OUT:/out" -e SEMGREP_SEND_METRICS=off "$SEMGREP_IMAGE" \
    semgrep scan --metrics=off --disable-version-check \
      --config p/typescript --config p/react --config p/nextjs --config p/nodejsscan --config p/owasp-top-ten --config p/secrets \
      --exclude node_modules --exclude .next --exclude coverage --exclude storybook-static \
      --json --output /out/semgrep.json /src/packages || true
  node -e '
    const r = require(process.argv[1]);
    const lines = [
      `files scanned: ${r.paths.scanned.length}`,
      `files skipped: ${(r.paths.skipped ?? []).length}`,
      `parse errors: ${r.errors.length}`,
      `findings: ${r.results.length}`,
      ...r.results.map((f) => `- [${f.extra.severity}] ${f.check_id} ${f.path.replace("/src/", "")}:${f.start.line}`),
      ...r.errors.slice(0, 20).map((e) => `! ${e.type ?? ""} ${(e.path ?? "").replace("/src/", "")} ${String(e.message).slice(0, 160)}`),
    ];
    require("fs").writeFileSync(process.argv[2], lines.join("\n") + "\n");
    console.log(lines.slice(0, 4).join("\n"));
  ' "$OUT/semgrep.json" "$OUT/semgrep.txt"
fi

if [ "$WHAT" = dast ] || [ "$WHAT" = all ]; then
  # Local test env only: refuse any host other than the loopback the descriptor's own app binds to.
  URL=$(node -e 'const e=require("./.ai/qa/test-env.json"); if (e.status!=="running") { console.error("test env is not running: sh .ai/scripts/test-env-up.sh"); process.exit(1) } const h=new URL(e.baseUrl).hostname; if (!["127.0.0.1","localhost"].includes(h)) { console.error(`refusing to scan non-local host ${h}`); process.exit(1) } console.log(e.baseUrl)')
  echo "== DAST: ZAP baseline (passive spider + passive rules, no attacks) on $URL"
  digest "$ZAP_IMAGE" > "$OUT/zap.image"
  docker run --rm --network host -u "$(id -u):$(id -g)" -v "$OUT:/zap/wrk:rw" "$ZAP_IMAGE" \
    zap-baseline.py -t "$URL" -m 2 -r zap.html -J zap.json -w zap.md -I || true
  node -e '
    const r = require(process.argv[1]);
    const alerts = r.site.flatMap((s) => s.alerts);
    const lines = alerts.map((a) => `- [${a.riskdesc}] ${a.alert} (${a.count} URLs) e.g. ${a.instances[0]?.uri ?? ""}`);
    require("fs").writeFileSync(process.argv[2], `alerts: ${alerts.length}\n${lines.join("\n")}\n`);
    console.log(`alerts: ${alerts.length}\n${lines.join("\n")}`);
  ' "$OUT/zap.json" "$OUT/zap.txt"
fi
