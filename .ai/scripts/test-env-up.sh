#!/bin/sh
# om-prepare-test-env: generated entrypoint
# Brings up a disposable DevMentor test environment: PostgreSQL 17 in Docker (scoped container,
# random 127.0.0.1 port), committed migrations + demo seed, the GitHub and Stripe stubs and the
# production build — the integration suite's wiring (packages/app/integration/global-setup.ts).
# Writes .ai/qa/test-env.json for QA skills and prints the base URL.
# Usage: sh .ai/scripts/test-env-up.sh [--force] [--force-rebuild]
# Needs Docker and Node; runs outside the agent sandbox (the owner runs it: `! sh .ai/scripts/test-env-up.sh`).
# history:
# 2026-11-21 generated (lesson 11 manual test of booking → session → payout). Verified: cold 29s (rebuilt), warm reused.
# 2026-11-21 db:migrate rewrote packages/db/src/migrations/.snapshot-devmentor.json (key order) and dirtied the
#            worktree — the snapshot is now backed up before migrating and restored after.
# 2026-11-22 review of PR #68: fingerprint uses tree hashes of packages/ (a .ai-only commit rebuilt for 34s) and
#            covers untracked files; reuse also requires the running instance's fingerprint to match.
# 2026-11-22 the snapshot is restored from the EXIT trap, so a Ctrl-C during db:migrate no longer leaves it
#            rewritten (spec 2026-11-22-qa-session-walk, step 1).
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
QA_DIR="$ROOT/.ai/qa"
STATE_DIR="$ROOT/.ai/tmp/test-env"
DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
PIDFILE="$STATE_DIR/app.pid"
LOCK="$STATE_DIR/lock"
LOG="$STATE_DIR/app.log"
RUNTIME="$STATE_DIR/runtime.json"
CONTAINER=devmentor-test-env-pg
FORCE=0
FORCE_REBUILD=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$QA_DIR" "$STATE_DIR"
command -v docker >/dev/null || { echo "test-env: docker is required" >&2; exit 1; }
command -v node >/dev/null || { echo "test-env: node is required" >&2; exit 1; }

# Bootstrap lock (PID-checked, so a crashed run does not block the next one).
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "test-env: another bootstrap is running (pid $(cat "$LOCK"))" >&2; exit 1
fi
echo $$ > "$LOCK"
SNAPSHOT="$ROOT/packages/db/src/migrations/.snapshot-devmentor.json"
MIGRATING=0
# On any exit — Ctrl-C included (dash runs the EXIT trap only after an explicit exit) — drop the lock and,
# while db:migrate is in flight, put the MikroORM snapshot back.
cleanup() {
  [ "$MIGRATING" = 1 ] && cp "$STATE_DIR/snapshot.bak" "$SNAPSHOT"
  rm -f "$LOCK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

healthy() { curl -fsS "$1/api/health" >/dev/null 2>&1; }

# Build inputs only: tree hashes of the committed sources, uncommitted edits and untracked files under
# packages/ — a commit that touches only .ai/ or docs does not force a rebuild.
FINGERPRINT=$(cd "$ROOT" && {
  git rev-parse HEAD:packages HEAD:package.json HEAD:package-lock.json
  git diff HEAD -- packages package.json package-lock.json
  git ls-files --others --exclude-standard -z packages | xargs -0 -r sha256sum
} | sha256sum | cut -d' ' -f1)

# Reuse: a live launcher whose app answers /api/health and was started from the same sources.
if [ "$FORCE" = 0 ] && [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null && [ -f "$DESCRIPTOR" ]; then
  BASE_URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DESCRIPTOR','utf8')).baseUrl)")
  RUNNING_FP=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DESCRIPTOR','utf8')).fingerprint ?? '')")
  if [ "$RUNNING_FP" != "$FINGERPRINT" ]; then
    echo "test-env: sources changed since the running instance started, restarting"
  elif healthy "$BASE_URL"; then
    echo "test-env: reused"
    echo "BASE_URL=$BASE_URL"
    exit 0
  fi
fi

# Stop a previous instance this script started.
[ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true
rm -f "$PIDFILE"

START=$(date +%s)
CACHED=$( [ -f "$BUILD_CACHE" ] && node -e "console.log(JSON.parse(require('fs').readFileSync('$BUILD_CACHE','utf8')).fingerprint)" || echo none)
if [ "$FORCE_REBUILD" = 1 ] || [ "$CACHED" != "$FINGERPRINT" ] || [ ! -f "$ROOT/packages/app/.next/BUILD_ID" ]; then
  echo "test-env: building"
  (cd "$ROOT" && npm run build >/dev/null)
  printf '{"fingerprint":"%s","root":"%s"}\n' "$FINGERPRINT" "$ROOT" > "$BUILD_CACHE"
  BUILT=rebuilt
else
  BUILT=reused
fi

# PostgreSQL: a fresh scoped container on a random loopback port every cold start.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_USER=devmentor -e POSTGRES_PASSWORD=devmentor -e POSTGRES_DB=devmentor \
  -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
PG_PORT=$(docker port "$CONTAINER" 5432/tcp | head -n1 | sed 's/.*://')
i=0
until docker exec "$CONTAINER" pg_isready -U devmentor -d devmentor >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "test-env: postgres did not start" >&2; exit 1; }; sleep 1
done
sleep 1
DATABASE_URL="postgres://devmentor:devmentor@127.0.0.1:$PG_PORT/devmentor"
export DATABASE_URL

cp "$SNAPSHOT" "$STATE_DIR/snapshot.bak"
MIGRATING=1
(cd "$ROOT" && npm run db:migrate >/dev/null)
cp "$STATE_DIR/snapshot.bak" "$SNAPSHOT"
MIGRATING=0
(cd "$ROOT" && npm run db:seed >/dev/null)

APP_PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
BASE_URL="http://127.0.0.1:$APP_PORT"
rm -f "$RUNTIME"
nohup node "$ROOT/.ai/scripts/test-env-launcher.mjs" "$DATABASE_URL" "$APP_PORT" "$RUNTIME" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

i=0
until healthy "$BASE_URL"; do
  i=$((i + 1))
  if [ "$i" -gt 120 ] || ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "test-env: app did not become healthy; last log lines:" >&2; tail -n 30 "$LOG" >&2; exit 1
  fi
  sleep 1
done

ELAPSED=$(( $(date +%s) - START ))
node -e "
const fs = require('fs');
const runtime = JSON.parse(fs.readFileSync('$RUNTIME', 'utf8'));
fs.writeFileSync('$DESCRIPTOR', JSON.stringify({
  status: 'running',
  baseUrl: '$BASE_URL',
  startedByThisRepo: true,
  fingerprint: '$FINGERPRINT',
  startScript: '.ai/scripts/test-env-up.sh',
  stopScript: '.ai/scripts/test-env-down.sh',
  platform: 'posix',
  services: { postgres: { container: '$CONTAINER', port: $PG_PORT }, githubStub: runtime.githubStubUrl, stripeStub: runtime.stripeStubUrl },
  appLog: '.ai/tmp/test-env/app.log',
  accounts: {
    note: 'Sign in with GitHub: the stub turns the login into <login>@devmentor.test. Demo password accounts: see README (development only).',
    mentee: 'mock-mentee', mentor: 'mock-mentor', operator: 'mock-operator'
  },
  notes: ['build: $BUILT', 'cold start: ${ELAPSED}s', 'Stripe is the local stub: Pay/Cancel on its hosted page; Connect onboarding completes on its page.']
}, null, 2) + '\n');
"
echo "test-env: ready ($BUILT build, ${ELAPSED}s)"
echo "BASE_URL=$BASE_URL"
