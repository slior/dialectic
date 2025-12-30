#!/bin/sh
set -e

# Start web-api in background
echo "Starting Dialectic Web API on port ${PORT:-3001}..."
cd /app/packages/web-api
node dist/main.js &
API_PID=$!

# Wait a moment for API to start
sleep 2

# Start web-ui in foreground
echo "Starting Dialectic Web UI on port 3000..."
cd /app/packages/web-ui
exec npm run start -w @dialectic/web-ui -- --port "${WEB_UI_PORT:-3000}"

# If web-ui exits, kill API
trap "kill $API_PID" EXIT

