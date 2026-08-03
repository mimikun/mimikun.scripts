#!/bin/bash

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# magic
if ! test "$(
  sudo -v >>/dev/null
  echo $?
)" -eq 0; then
  exit 1
fi

echo "rustup update"
rust_task_id=$(pueue add -p -- "rustup update")

echo "deno upgrade"
pueue add -- "deno upgrade"

echo "bun upgrade"
pueue add -- "bun upgrade"

# TODO: it
echo "mise upgrade (has human rights)"
mise_task_id=$(pueue add -p -- "mise upgrade")

# `mise upgrade` already covers vim@latest and zig@master -- run
# `mise upgrade --dry-run` to see it say so. The one pin it cannot refresh is
# vim@ref:master: the version string stays "ref:master" however far upstream
# moves, so the tool never turns up in `mise outdated`. That is all this does,
# and the zig block that used to live here was doing mise's job twice.
echo "update mise ref-pinned tools"
bun run "$SCRIPT_DIR/src/update/mise-refs.ts" --after "$mise_task_id"

echo "tldr --update"
pueue add -- "tldr --update"

echo "gh extensions upgrade --all"
pueue add -- "gh extensions upgrade --all"

echo "flyctl version upgrade"
pueue add -- "flyctl version upgrade"

echo "pnpm self-update"
pueue add -- "pnpm self-update"

echo "update neovim managed by bob"
bob_task_id=$(pueue add -p -- "bob use latest")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update nightly")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob use nightly")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update stable")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update latest")
pueue add --after "$bob_task_id" -- "bob install head"

echo "update fish plugins"
pez upgrade
#fish -c 'fisher update'

# Clean stale cargo-install leftovers in /tmp before kicking off new builds.
# Only targets cargo-install* dirs untouched for 30+ min, so in-progress
# builds and other /tmp work dirs are never touched. No sudo required.
echo "clean stale /tmp/cargo-install leftovers"
find /tmp -maxdepth 1 -name 'cargo-install*' -type d -mmin +30 -exec rm -rf {} + 2>/dev/null

echo "update_cargo_packages"
bun run "$SCRIPT_DIR/src/update/cargo-packages.ts" --after "$rust_task_id"

echo "gup update"
task_id=$(pueue add -p -- "gup update")

echo "gup export"
pueue add --after "$task_id" -- "gup export"

echo "update aqua"
aqua_task_id=$(pueue add -p -- "aqua update-aqua")
aqua_task_id=$(pueue add --after "$aqua_task_id" -p -- "aqua install --all")
aqua_task_id=$(pueue add --after "$aqua_task_id" -p -- "aqua update")
aqua_task_id=$(pueue add --after "$aqua_task_id" -p -- "aqua install --all")
pueue add --after "$aqua_task_id" -- "aqua vacuum"

echo "sunbeam extension upgrade --all"
pueue add -- "sunbeam extension upgrade --all"

echo "cleanup cargo caches"
pueue add -- "cargo cache -a"

echo "upgrade pixi"
#pueue add -- "pixi self-upgrade"

echo "update docker compose plugin"
bun run "$SCRIPT_DIR/src/update/docker-compose.ts" --no-pueue

# chromedriver, geckodriver and twitch-cli used to be updated here by hand.
# They are package-manager tools now, so `mise upgrade` and `aqua update`
# above already cover them.

if command -v deps_update >/dev/null 2>&1; then
  echo "This is Work-PC!!!"
  echo "Run Work-PC only update tasks"
  deps_update
fi

# ファイルがあれば再起動を促す
if test -e /var/run/reboot-required; then
  # WSL かチェックする
  if test ! -e /proc/sys/fs/binfmt_misc/WSLInterop; then
    echo "\"/var/run/reboot-required\" exists. Reboot the system?(recommend)"
    re_boot
  fi
fi
