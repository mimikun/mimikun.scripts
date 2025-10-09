#!/bin/bash

# magic
if ! test "$(
  sudo uname >>/dev/null
  echo $?
)" -eq 0; then
  exit 1
fi

sudo pacman -Qqen |
  LC_ALL=C sort >"$HOME/.mimikun-pkglists/linux_arch_official_packages.txt"

sudo pacman -Qqem |
  LC_ALL=C sort >"$HOME/.mimikun-pkglists/linux_arch_aur_packages.txt"

cargo install-update --list |
  tail -n +4 |
  sed -e "s/ /\t/g" |
  cut -f 1 |
  sed "/^\$/d" |
  LC_ALL=C sort >"$HOME/.mimikun-pkglists/linux_cargo_packages.txt"

pip freeze |
  sed \
    -e "s/=.*//g" \
    -e "s/ @.*//g" |
  LC_ALL=C sort > \
    "$HOME/.mimikun-pkglists/linux_pip_packages.txt"

pipx list --short |
  cut -d " " -f 1 |
  LC_ALL=C sort > \
    "$HOME/.mimikun-pkglists/linux_pipx_packages.txt"

pnpm list --global --json |
  jq --raw-output ".[].dependencies | keys[]" |
  LC_ALL=C sort >"$HOME/.mimikun-pkglists/linux_pnpm_packages.txt"

uv tool list |
  grep "v[0-9]" |
  sed -e "s/\s.*//g" |
  LC_ALL=C sort >"$HOME/.mimikun-pkglists/linux_uv_tools.txt"

gup export
