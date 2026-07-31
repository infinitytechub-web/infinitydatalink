#!/usr/bin/env bash
# Boot the built Cloudflare Worker locally, run a Playwright perf measurement
# against it, then shut it down. Usage: scripts/perf-measure.sh <label>
set -uo pipefail
LABEL="${1:-run}"
cd "$(dirname "$0")/.."
(cd dist && exec npx --yes wrangler@latest dev --port 4180 --local) > /tmp/wrangler-perf.log 2>&1 &
WPID=$!
code=000
for _ in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4180/ || echo 000)
  [ "$code" != "000" ] && break
done
echo "worker http status: $code"
if [ "$code" = "200" ]; then
  python3 /tmp/browser/perf/measure.py http://localhost:4180/ "$LABEL"
else
  tail -25 /tmp/wrangler-perf.log
fi
kill "$WPID" 2>/dev/null
pkill -f "wrangler" 2>/dev/null
exit 0
