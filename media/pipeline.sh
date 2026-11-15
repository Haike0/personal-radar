#!/bin/sh
# Rebuild ReadMe, take fresh screenshots on a throwaway data folder, compose the brand images.
#   sh media/pipeline.sh
set -e
cd "$(dirname "$0")/.."
DATA="${SHOTS_DATA:-$(mktemp -d)}"
PORT="${SHOTS_PORT:-3240}"
npx next build > /tmp/readme-build.log 2>&1 || { tail -30 /tmp/readme-build.log; exit 1; }
node -e 'import("./bin/standalone.mjs").then(m=>m.finishStandalone(process.cwd()))'
pkill -f "radar.mjs --port $PORT" 2>/dev/null || true
sleep 1
RADAR_DATA_DIR="$DATA" node bin/radar.mjs --port "$PORT" --no-open > /tmp/readme-shots-server.log 2>&1 &
SERVER=$!
until curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health"; do sleep 1; done
(cd media && BASE="http://127.0.0.1:$PORT" node shots.mjs && node compose.mjs)
kill $SERVER
echo "pipeline done"
