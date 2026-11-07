#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! python3 -c "import graphify, tree_sitter_sql" 2>/dev/null; then
  python3 -m pip install -q "graphifyy[sql]" 2>/dev/null \
    || python3 -m pip install -q --break-system-packages "graphifyy[sql]"
fi
graphify update . "$@"
