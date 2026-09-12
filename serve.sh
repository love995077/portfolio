#!/usr/bin/env bash
# Local preview. The site is fully static — this is just a file server.
PORT="${1:-4190}"
echo "→ http://localhost:$PORT"
exec python -m http.server "$PORT" -d "$(dirname "$0")"
