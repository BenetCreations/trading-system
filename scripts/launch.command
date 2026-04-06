#!/bin/bash
# Trading System launcher — double-click to start server and open Chrome.
# Works regardless of where this file is placed or symlinked.

cd "$(dirname "$0")/.." || exit 1

# ── Build client if dist/client/ is missing ──────────────────────────────────
if [ ! -d "dist/client" ]; then
  echo "dist/client/ not found — running npm run build first…"
  npm run build || exit 1
fi

# Enable job control so background processes get their own process group.
# This lets us kill the entire npm+node tree with kill -- -$SERVER_PID.
set -m

# ── Start server in background, capture PID ──────────────────────────────────
npm start &
SERVER_PID=$!

# ── Trap signals → clean shutdown ────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down server (PID $SERVER_PID)…"
  kill -- -"$SERVER_PID" 2>/dev/null   # kill entire process group (npm + node)
  wait "$SERVER_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGHUP SIGINT SIGTERM

# ── Wait for server to be ready, then open Chrome ────────────────────────────
sleep 3
open -a "Google Chrome" http://localhost:3000

# ── Stay alive while server runs ─────────────────────────────────────────────
wait "$SERVER_PID"
