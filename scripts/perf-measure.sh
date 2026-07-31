#!/usr/bin/env bash
# Boot the built Cloudflare Worker locally and run a Playwright perf
# measurement against it. Usage: bash scripts/perf-measure.sh <label> [path]
set -uo pipefail
LABEL="${1:-run}"
PATH_="${2:-/}"
PORT=4181
cd "$(dirname "$0")/../dist"
(npx --yes wrangler@latest dev --port "$PORT" --local > /tmp/wrangler-perf.log 2>&1 &)
code=000
for _ in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/")
  [ "$code" != "000" ] && break
done
echo "worker http status: $code"
if [ "$code" = "200" ]; then
  python3 /tmp/browser/perf/measure.py "http://localhost:$PORT$PATH_" "$LABEL"
else
  tail -25 /tmp/wrangler-perf.log
fi
