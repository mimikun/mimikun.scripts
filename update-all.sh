#!/bin/bash

### 1. Magic
if ! test "$(
  sudo -v >>/dev/null
  echo $?
)" -eq 0; then
  exit 1
fi

### 2. OS Level
## 1. Arch Linux - pacman
sudo pacman -Syu
sudo pacman -Sc

## 2. Arch Linux - paru
paru
paru --clean
paru -Sc

### 3. Software Level
echo "rustup update"
pueue add -- "rustup update"

