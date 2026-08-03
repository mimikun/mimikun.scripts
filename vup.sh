#!/bin/bash
# Thin wrapper. The implementation is src/update/all.ts.
#
# What is left here is the one thing that has to happen before bun starts: the
# sudo timestamp. `paru -Syu` and the compose plugin's system-wide copy both
# need it, and a password prompt has to reach the terminal directly.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# magic
if ! sudo -v >/dev/null; then
  exit 1
fi

exec bun run "$SCRIPT_DIR/src/update/all.ts" "$@"
