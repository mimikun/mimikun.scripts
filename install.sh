#!/bin/bash

set -euo pipefail

SKIP_ARCH_PKGS_INSTALL=false

PACKAGE_LIST_AUR="${1:-$HOME/.mimikun-pkglists/linux_arch_aur_packages.txt}"
PACKAGE_LIST_OFFICIAL="${1:-$HOME/.mimikun-pkglists/linux_arch_official_packages.txt}"
PACKAGE_LIST_UV="${1:-$HOME/.mimikun-pkglists/linux_uv_tools.txt}"
PACKAGE_LIST_PIP="${1:-$HOME/.mimikun-pkglists/linux_pip_packages.txt}"
PACKAGE_LIST_PIPX="${1:-$HOME/.mimikun-pkglists/linux_pipx_packages.txt}"
PACKAGE_LIST_PNPM="${1:-$HOME/.mimikun-pkglists/linux_pnpm_packages.txt}"
PACKAGE_LIST_CARGO="${1:-$HOME/.mimikun-pkglists/linux_cargo_packages.txt}"
PACKAGE_LIST_GH_EXT="${1:-$HOME/.mimikun-pkglists/gh_extension_list.txt}"

# magic
if ! test "$(
  sudo uname >>/dev/null
  echo $?
)" -eq 0; then
  exit 1
fi

# Check if paru is installed
if ! command -v paru &>/dev/null; then
  echo "Error: paru is not installed" >&2
  exit 1
fi

if $SKIP_ARCH_PKGS_INSTALL; then
  echo "install arch aur packages"
  # AUR
  while IFS= read -r package || [[ -n "$package" ]]; do
    # Skip empty lines and comments
    [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue

    # Trim whitespace
    package=$(echo "$package" | xargs)

    echo "Installing: $package"
    if paru -S --noconfirm "$package"; then
      echo "✓ Successfully installed: $package"
    else
      echo "✗ Failed to install: $package" >&2
    fi
    echo
  done <"$PACKAGE_LIST_AUR"

  echo "install arch official packages"
  # OFFICIAL
  while IFS= read -r package || [[ -n "$package" ]]; do
    # Skip empty lines and comments
    [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue

    # Trim whitespace
    package=$(echo "$package" | xargs)

    echo "Installing: $package"
    if paru -S --noconfirm "$package"; then
      echo "✓ Successfully installed: $package"
    else
      echo "✗ Failed to install: $package" >&2
    fi
    echo
  done <"$PACKAGE_LIST_OFFICIAL"
fi

################################################################################################################

echo "install cargo packages"
function existsCmd() {
  type -a "$1" >/dev/null 2>&1
}

# HACK: tabiew can't build
install_cargo_tabiew() {
  echo "compiling \"tabiew\" takes a SO LONG time"
  echo "can't install it from crates.io"
}

# HACK: rustowl can't build
install_cargo_rustowl() {
  echo "compiling \"rustowl\" takes a SO LONG time"
  echo "can't install it from crates.io"
}

while read -r line; do
  if ! existsCmd "$line"; then
    echo "$line is not found"
    case "$line" in
    "tabiew")
      install_cargo_tabiew
      ;;
    "rustowl")
      install_cargo_rustowl
      ;;
    *)
      pueue add -- "cargo install $line"
      ;;
    esac
  fi
done <"$PACKAGE_LIST_CARGO"

################################################################################################################

echo "install gh extensions"
while read -r line; do
  echo "Install: $line"
  pueue add -- "gh extension install $line"
done <"$PACKAGE_LIST_GH_EXT"

################################################################################################################

echo "install pip packages"
while read -r line; do
  case "$line" in
  "thefuck")
    echo "Install specify version thefuck"
    pueue add -- "pip install 'thefuck @ git+https://github.com/nvbn/thefuck@62e0767c5069aeee176b0fe3459068b7703aaa26'"
    ;;
  *)
    echo "Install: $line"

    pueue add -- "pip install $line"
    ;;
  esac
done <"$PACKAGE_LIST_PIP"

################################################################################################################

echo "install pipx packages"
while read -r line; do
  echo "Install: $line"
  pueue add -- "pipx install $line"
done <"$PACKAGE_LIST_PIPX"

################################################################################################################

echo "install pnpm packages"
while read -r line; do
  pueue add -- "pnpm install --global $line"
done <"$PACKAGE_LIST_PNPM"

################################################################################################################

echo "install uv tools"
while read -r line; do
  echo "Install: $line"

  pueue add -- "uv tool install $line"
done <"$PACKAGE_LIST_UV"

################################################################################################################

echo "gup import"
pueue add -- "gup import"
