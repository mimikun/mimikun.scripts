#!/bin/bash

COMPLETIONS_DIR="$HOME/.config/fish/completions"

# Usage: command_exist CMD_NAME
command_exist() {
    if type "$1" >/dev/null 2>&1; then
        return 0
    else
        echo "$1: not found"
        return 1
    fi
}

# Usage: envvar_exist ENV_VAR
envvar_exist() {
    if [ -n "${!1}" ]; then
        return 0
    else
        echo "${!1}: not set"
        return 1
    fi
}
update_sharkdp_tool_completions() {
    CMD_NAME="$1"
    REPO_NAME="sharkdp/$CMD_NAME"
    CMD_VERSION=$(curl --silent "https://api.github.com/repos/$REPO_NAME/releases/latest" | jq .tag_name -r)
    ARCHIVE_NAME="$CMD_NAME-$CMD_VERSION-x86_64-unknown-linux-gnu"
    ARCHIVE_FORMAT="tar.gz"
    ARCHIVE_FILE="$ARCHIVE_NAME.$ARCHIVE_FORMAT"
    DOWNLOAD_URL="https://github.com/$REPO_NAME/releases/download/$CMD_VERSION/$ARCHIVE_FILE"
    pushd /tmp || exit
    USTC_TASK_ID=$(pueue add -p -- "wget $DOWNLOAD_URL")
    USTC_TASK_ID=$(pueue add --after "$USTC_TASK_ID" -p -- "tar xvf $ARCHIVE_FILE")
    USTC_TASK_ID=$(pueue add --after "$USTC_TASK_ID" -p -- "cp $ARCHIVE_NAME/autocomplete/$CMD_NAME.fish $COMPLETIONS_DIR/$CMD_NAME.fish")
    pueue add --after "$USTC_TASK_ID" -- "rm -rf $ARCHIVE_FILE*"
    popd || exit
}

pueue add -- "fish -c 'fish_update_completions'"

# Pattern: CMD completions fish
completions_cmds=(
    "ast-grep"
    "deno"
    "doggo"
    "mdbook"
    "pez"
    "poetry"
    "rip"
    "rustup"
    "starship"
    "deadbranch"
    "unifly"
)
for cmd in "${completions_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' completions fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

# Pattern: CMD completion fish
completion_cmds=(
    "acli"
    "aqua"
    "aube"
    "autohand"
    "berg"
    "bin"
    "chezmoi"
    "envdiff"
    "flyctl"
    "fnox"
    "gitleaks"
    "glow"
    "goose"
    "gopass"
    "hk"
    "kiro-cli"
    "lefthook"
    "luarocks"
    "mani"
    "mise"
    "nvs"
    "pass-cli"
    "pgit"
    "pitchfork"
    "pnpm"
    "runme"
    "rvpm"
    "sake"
    "sunbeam"
    "taws"
    "turm"
    "herdr"
    "hyprmoncfg"
    "sharedserver"
    "tombi"
)
for cmd in "${completion_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' completion fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

# Pattern: CMD --completion fish
dashdash_completion_cmds=(
    "ccsum"
    "ov"
    "task"
)
for cmd in "${dashdash_completion_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' --completion fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

# Pattern: CMD shell-completion fish
shell_completion_cmds=(
    "pkl"
    "yq"
)
for cmd in "${shell_completion_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' shell-completion fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

if command_exist bun; then
    pueue add -- "bun completions"
fi

if command_exist gh; then
    pueue add -- "gh completion -s fish > '${COMPLETIONS_DIR}'/gh.fish"
fi

if command_exist fd; then
    pueue add -- "fd --gen-completions fish > '${COMPLETIONS_DIR}'/fd.fish"
fi

if command_exist zellij; then
    pueue add -- "zellij setup --generate-completion fish > '${COMPLETIONS_DIR}'/zellij.fish"
fi

if command_exist pipx; then
    pueue add -- "register-python-argcomplete --shell fish pipx > '${COMPLETIONS_DIR}'/pipx.fish"
fi

# Pattern: CMD shell-completion --shell fish
shell_completion_shell_cmds=(
    "moon"
    "wezterm"
)
for cmd in "${shell_completion_shell_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' shell-completion --shell fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

# Pattern: CMD --completions fish
dashdash_completions_cmds=(
    "purple"
    "srgn"
    "ttl "
    "usage"
)
for cmd in "${dashdash_completions_cmds[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "'${cmd}' --completions fish > '${COMPLETIONS_DIR}'/'${cmd}'.fish"
    fi
done

if command_exist rye; then
    pueue add -- "rye self completion -s fish > '${COMPLETIONS_DIR}'/rye.fish"
fi

if command_exist procs; then
    pueue add -- "procs --gen-completion-out fish > '${COMPLETIONS_DIR}'/procs.fish"
fi

if command_exist pueue; then
    pueue add -- "pueue completions fish '${COMPLETIONS_DIR}'"
fi

if command_exist rbw; then
    pueue add -- "rbw gen-completions fish > '${COMPLETIONS_DIR}'/rbw.fish"
fi

if command_exist brew; then
    pueue add -- "cp $(brew --prefix)/Homebrew/completions/fish/brew.fish ${COMPLETIONS_DIR}/brew.fish"
fi

if command_exist rg; then
    pueue add -- "rg --generate complete-fish > '${COMPLETIONS_DIR}'/rg.fish"
fi

if command_exist uv; then
    pueue add -- "uv --generate-shell-completion fish > '${COMPLETIONS_DIR}'/uv.fish"
fi

if command_exist fish-lsp; then
    pueue add -- "fish-lsp complete --fish > '${COMPLETIONS_DIR}'/fish-lsp.fish"
fi

if command_exist atuin; then
    pueue add -- "atuin gen-completions --shell fish> '${COMPLETIONS_DIR}'/atuin.fish"
fi

if command_exist codex && envvar_exist OPENAI_API_KEY; then
    pueue add -- "codex completion fish> '${COMPLETIONS_DIR}'/codex.fish"
fi

if command_exist pixi; then
    pueue add -- "pixi completion --shell fish> '${COMPLETIONS_DIR}'/pixi.fish"
fi

if command_exist ty; then
    pueue add -- "ty generate-shell-completion fish > '${COMPLETIONS_DIR}'/ty.fish"
fi

if command_exist jg ; then
    pueue add -- "jg generate shell fish > '${COMPLETIONS_DIR}'/jg.fish"
fi

# install via curl
# Pattern: CMD -> completion URL (output file is '${COMPLETIONS_DIR}'/CMD.fish)
declare -A curl_completions=(
    ["eza"]="https://raw.githubusercontent.com/eza-community/eza/main/completions/fish/eza.fish"
    ["tldr"]="https://raw.githubusercontent.com/dbrgn/tealdeer/main/completion/fish_tealdeer"
    ["zoxide"]="https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/contrib/completions/zoxide.fish"
    ["alacritty"]="https://raw.githubusercontent.com/alacritty/alacritty/master/extra/completions/alacritty.fish"
    ["ghq"]="https://raw.githubusercontent.com/x-motemen/ghq/master/misc/fish/ghq.fish"
    ["foot"]="https://codeberg.org/dnkl/foot/raw/branch/master/completions/fish/foot.fish"
    ["footclient"]="https://codeberg.org/dnkl/foot/raw/branch/master/completions/fish/footclient.fish"
    ["nix"]="https://raw.githubusercontent.com/NixOS/nix/master/misc/fish/completion.fish"
    ["nb"]="https://raw.githubusercontent.com/xwmx/nb/refs/heads/master/etc/nb-completion.fish"
    ["hoard"]="https://raw.githubusercontent.com/Hyde46/hoard/refs/heads/main/src/shell/hoard.fish"
    ["qsv"]="https://raw.githubusercontent.com/dathere/qsv/refs/heads/master/contrib/completions/examples/qsv.fish"
    ["g"]="https://raw.githubusercontent.com/Equationzhao/g/master/completions/fish/g.fish"
)
for cmd in "${!curl_completions[@]}"; do
    if command_exist "${cmd}"; then
        pueue add -- "curl -L ${curl_completions[$cmd]} -o '${COMPLETIONS_DIR}'/${cmd}.fish"
    fi
done

# Special cases: one command check produces multiple completion files
if command_exist http; then
    pueue add -- "curl -L https://raw.githubusercontent.com/httpie/httpie/master/extras/httpie-completion.fish -o '${COMPLETIONS_DIR}'/http.fish"
    pueue add -- "curl -L https://raw.githubusercontent.com/httpie/httpie/master/extras/httpie-completion.fish -o '${COMPLETIONS_DIR}'/https.fish"
fi

if command_exist hx || command_exist helix; then
    pueue add -- "curl -L https://raw.githubusercontent.com/helix-editor/helix/master/contrib/completion/hx.fish -o '${COMPLETIONS_DIR}'/hx.fish"
    pueue add -- "curl -L https://raw.githubusercontent.com/helix-editor/helix/master/contrib/completion/hx.fish -o '${COMPLETIONS_DIR}'/helix.fish"
fi

# Pattern: download from sharkdp GitHub releases
sharkdp_cmds=(
    "bat"
    "hyperfine"
    "pastel"
)
for cmd in "${sharkdp_cmds[@]}"; do
    if command_exist "${cmd}"; then
        update_sharkdp_tool_completions "${cmd}"
    fi
done

