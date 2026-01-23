#!/bin/bash

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
pvim_task_id=$(pueue add -p --after "$mise_task_id" -- "update_mise paleovim-master --use-pueue")
pueue add --after "$pvim_task_id" -- "update_mise paleovim-latest --use-pueue"

zig_version_file="$HOME/.cache/zig-master-version.txt"
zig_version=$(cat "$zig_version_file")
new_zig_version=$(curl -sSL https://ziglang.org/download/index.json | jq .master.version --raw-output)

if [ "$zig_version" != "$new_zig_version" ]; then
  echo "zig (latest)master found!"
  echo "$new_zig_version" >"$zig_version_file"
  task_id=$(pueue add -p --after "$mise_task_id" -- "mise uninstall zig@master")
  pueue add --after "$task_id" -- "mise install zig@master"
else
  echo "zig (latest)master is already installed"
  echo "version: $zig_version"
fi

echo "tldr --update"
pueue add -- "tldr --update"

echo "gh extensions upgrade --all"
pueue add -- "gh extensions upgrade --all"

echo "flyctl version upgrade"
pueue add -- "flyctl version upgrade"

echo "update_pnpm"
pueue add -- "update_pnpm"

echo "update neovim managed by bob"
bob_task_id=$(pueue add -p -- "bob use latest")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update nightly")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob use nightly")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update stable")
bob_task_id=$(pueue add -p --after "$bob_task_id" -- "bob update latest")
pueue add --after "$bob_task_id" -- "bob install head"

echo "update fish plugins"
pez upgrade
fish -c 'fisher update'

echo "update_cargo_packages"
cargo_outdated_pkgs=$(cargo install-update -l | grep "Yes" | cut -d " " -f 1)
echo "Update these packages:"
echo "$cargo_outdated_pkgs"
for i in $cargo_outdated_pkgs; do
  task_id=$(pueue add -p --after "$rust_task_id" -- "cargo install $i")
done

echo "update_fish_completions"
update_fish_completions

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
pueue add -- "pixi self-upgrade"

echo "update_docker_compose"
update_docker_compose

echo "update_chromedriver"
update_chromedriver

echo "update_geckodriver"
update_geckodriver

echo "update_twitch_cli"
update_twitch_cli

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
