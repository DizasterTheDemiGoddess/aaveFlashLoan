#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load environment variables from .env if present (ignore commented lines)
if [ -f "$SCRIPT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs -d '\n' -r)
fi

# Ensure requests is available
if ! python3 -c "import requests" 2>/dev/null; then
  python3 -m pip install --user -q requests
fi

exec python3 "$SCRIPT_DIR/bulk_import_hub_items.py" "$@"

