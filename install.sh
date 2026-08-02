#!/usr/bin/env bash
# Install everything recorded in the package lists.
#
# The installs themselves are done by src/install/packages.ts; pass names to
# that script directly to install only some of them. The Arch lists are not
# included here because paru needs a terminal:
#
#   bun run src/install/packages.ts arch-official arch-aur
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

bun run "$SCRIPT_DIR/src/install/packages.ts"

# gup restores go-installed binaries from its own manifest.
pueue add -- "gup import"
