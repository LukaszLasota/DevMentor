#!/bin/sh
# om-prepare-test-env: generated teardown
# Stops exactly what test-env-up.sh started: the launcher (app + stubs) and the scoped PostgreSQL
# container. Safe to run twice.
# history:
# 2026-11-21 generated.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PIDFILE="$ROOT/.ai/tmp/test-env/app.pid"
DESCRIPTOR="$ROOT/.ai/qa/test-env.json"

if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
  rm -f "$PIDFILE"
fi
docker rm -f devmentor-test-env-pg >/dev/null 2>&1 || true
if [ -f "$DESCRIPTOR" ]; then
  node -e "const f='$DESCRIPTOR',fs=require('fs');const d=JSON.parse(fs.readFileSync(f,'utf8'));d.status='stopped';fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n')"
fi
echo "test-env: stopped"
