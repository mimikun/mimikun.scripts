#!/usr/bin/env bun
/**
 * Regenerate the fish completions that tools can produce themselves.
 *
 * Replaces `update-fish-completions.sh`. That script repeated the same
 * "does the command exist, then enqueue a redirect" shape twenty-odd times
 * and kept six near-identical `for` loops for the six subcommand spellings
 * tools use. Here the whole thing is one table: adding a tool means adding a
 * name to a list, and the shape of each recipe is checked by the compiler.
 *
 * Usage: fish-completions.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { commandExists, envVarSet } from "../lib/cmd.ts";
import { completionFile, completionsDir } from "../lib/fish.ts";
import { machineArch } from "../lib/platform.ts";
import { createDispatcher, type Dispatcher, parseArgs } from "../lib/runner.ts";
import { sq } from "../lib/shell.ts";

type Recipe =
  /** Run `argv` and redirect stdout into the completion file. */
  | { kind: "stdout"; argv: string[] }
  /** A command that writes the files itself; used verbatim. */
  | { kind: "raw"; command: (outputs: string[]) => string }
  /** Download the completion file, once per output. */
  | { kind: "url"; url: string }
  /** Pull it out of a sharkdp GitHub release tarball. */
  | { kind: "sharkdp" };

type Entry = {
  /** The entry applies when any one of these is on PATH. */
  requires: string[];
  /** ...and every one of these environment variables is set. */
  requiresEnv?: string[];
  /** ...and this file exists and is executable. */
  requiresExecutable?: string;
  /** Completion file basenames, written as `<name>.fish`. */
  outputs: string[];
  recipe: Recipe;
};

/**
 * The six spellings tools use for "print fish completions on stdout". Each
 * entry generates `<cmd> <args...> > <completions dir>/<cmd>.fish`.
 */
const SUBCOMMAND_PATTERNS: { args: string[]; cmds: string[] }[] = [
  {
    args: ["completions", "fish"],
    cmds: [
      "ast-grep",
      "deno",
      "doggo",
      "mdbook",
      "pez",
      "poetry",
      "rip",
      "rustup",
      "starship",
      "deadbranch",
      "unifly",
    ],
  },
  {
    args: ["completion", "fish"],
    cmds: [
      "acli",
      "aqua",
      "aube",
      "autohand",
      "berg",
      "bin",
      "chezmoi",
      "codex",
      "envdiff",
      "flyctl",
      "fnox",
      "gitleaks",
      "glow",
      "goose",
      "gopass",
      "hk",
      "kiro-cli",
      "lefthook",
      "luarocks",
      "mani",
      "mise",
      "nvs",
      "pass-cli",
      "pgit",
      "pitchfork",
      "pnpm",
      "runme",
      "rvpm",
      "sake",
      "sunbeam",
      "taws",
      "turm",
      "herdr",
      "hyprmoncfg",
      "sharedserver",
      "tombi",
    ],
  },
  { args: ["--completion", "fish"], cmds: ["ccsum", "ov", "task"] },
  { args: ["shell-completion", "fish"], cmds: ["pkl", "yq"] },
  { args: ["shell-completion", "--shell", "fish"], cmds: ["moon", "wezterm"] },
  // "ttl" carried a trailing space in the shell version, so `type "ttl "`
  // never matched and its completion silently stopped being refreshed.
  { args: ["--completions", "fish"], cmds: ["purple", "srgn", "ttl", "usage"] },
];

/** Tools whose invocation does not fit any of the shared patterns. */
const INDIVIDUAL: Entry[] = [
  // bun writes into the completions directory by itself.
  {
    requires: ["bun"],
    outputs: ["bun"],
    recipe: { kind: "raw", command: () => "bun completions" },
  },
  {
    // claude ships no completion generator, so these are produced by walking
    // `claude --help`. The generator lives in the fish config repo.
    requires: ["claude"],
    requiresExecutable: `${process.env.HOME}/.config/fish/scripts/gen-claude-completion.ts`,
    outputs: ["claude"],
    recipe: {
      // Written via a temp file: the generator exits non-zero when the help
      // output fails to parse, and a bare `>` would leave claude.fish empty.
      kind: "raw",
      command: () =>
        `${process.env.HOME}/.config/fish/scripts/gen-claude-completion.ts > /tmp/claude-completion.fish` +
        ` && mv /tmp/claude-completion.fish ${sq(completionFile("claude"))}`,
    },
  },
  {
    requires: ["gh"],
    outputs: ["gh"],
    recipe: { kind: "stdout", argv: ["gh", "completion", "-s", "fish"] },
  },
  {
    requires: ["bat"],
    outputs: ["bat"],
    recipe: { kind: "stdout", argv: ["bat", "--completion", "fish"] },
  },
  {
    requires: ["fd"],
    outputs: ["fd"],
    recipe: { kind: "stdout", argv: ["fd", "--gen-completions", "fish"] },
  },
  {
    requires: ["zellij"],
    outputs: ["zellij"],
    recipe: { kind: "stdout", argv: ["zellij", "setup", "--generate-completion", "fish"] },
  },
  {
    requires: ["pipx"],
    outputs: ["pipx"],
    recipe: { kind: "stdout", argv: ["register-python-argcomplete", "--shell", "fish", "pipx"] },
  },
  {
    requires: ["rye"],
    outputs: ["rye"],
    recipe: { kind: "stdout", argv: ["rye", "self", "completion", "-s", "fish"] },
  },
  {
    requires: ["procs"],
    outputs: ["procs"],
    recipe: { kind: "stdout", argv: ["procs", "--gen-completion-out", "fish"] },
  },
  {
    // pueue takes the destination directory as an argument.
    requires: ["pueue"],
    outputs: ["pueue"],
    recipe: { kind: "raw", command: () => `pueue completions fish ${sq(completionsDir())}` },
  },
  {
    requires: ["rbw"],
    outputs: ["rbw"],
    recipe: { kind: "stdout", argv: ["rbw", "gen-completions", "fish"] },
  },
  {
    // `brew --prefix` is resolved when the task runs rather than when it is
    // enqueued, which is the only behavioural difference from the original.
    requires: ["brew"],
    outputs: ["brew"],
    recipe: {
      kind: "raw",
      command: () =>
        `cp $(brew --prefix)/Homebrew/completions/fish/brew.fish ${sq(completionFile("brew"))}`,
    },
  },
  {
    requires: ["rg"],
    outputs: ["rg"],
    recipe: { kind: "stdout", argv: ["rg", "--generate", "complete-fish"] },
  },
  {
    requires: ["uv"],
    outputs: ["uv"],
    recipe: { kind: "stdout", argv: ["uv", "--generate-shell-completion", "fish"] },
  },
  {
    requires: ["fish-lsp"],
    outputs: ["fish-lsp"],
    recipe: { kind: "stdout", argv: ["fish-lsp", "complete", "--fish"] },
  },
  {
    requires: ["atuin"],
    outputs: ["atuin"],
    recipe: { kind: "stdout", argv: ["atuin", "gen-completions", "--shell", "fish"] },
  },
  {
    requires: ["pixi"],
    outputs: ["pixi"],
    recipe: { kind: "stdout", argv: ["pixi", "completion", "--shell", "fish"] },
  },
  {
    requires: ["ty"],
    outputs: ["ty"],
    recipe: { kind: "stdout", argv: ["ty", "generate-shell-completion", "fish"] },
  },
  {
    requires: ["jg"],
    outputs: ["jg"],
    recipe: { kind: "stdout", argv: ["jg", "generate", "shell", "fish"] },
  },
];

/** Tools that ship completions in their repository rather than in the binary. */
const DOWNLOADS: { cmds: string[]; outputs?: string[]; url: string }[] = [
  {
    cmds: ["eza"],
    url: "https://raw.githubusercontent.com/eza-community/eza/main/completions/fish/eza.fish",
  },
  {
    cmds: ["tldr"],
    url: "https://raw.githubusercontent.com/dbrgn/tealdeer/main/completion/fish_tealdeer",
  },
  {
    cmds: ["zoxide"],
    url: "https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/contrib/completions/zoxide.fish",
  },
  {
    cmds: ["alacritty"],
    url: "https://raw.githubusercontent.com/alacritty/alacritty/master/extra/completions/alacritty.fish",
  },
  {
    cmds: ["ghq"],
    url: "https://raw.githubusercontent.com/x-motemen/ghq/master/misc/fish/ghq.fish",
  },
  {
    cmds: ["foot"],
    url: "https://codeberg.org/dnkl/foot/raw/branch/master/completions/fish/foot.fish",
  },
  {
    cmds: ["footclient"],
    url: "https://codeberg.org/dnkl/foot/raw/branch/master/completions/fish/footclient.fish",
  },
  {
    cmds: ["nix"],
    url: "https://raw.githubusercontent.com/NixOS/nix/master/misc/fish/completion.fish",
  },
  {
    cmds: ["nb"],
    url: "https://raw.githubusercontent.com/xwmx/nb/refs/heads/master/etc/nb-completion.fish",
  },
  {
    cmds: ["hoard"],
    url: "https://raw.githubusercontent.com/Hyde46/hoard/refs/heads/main/src/shell/hoard.fish",
  },
  {
    cmds: ["qsv"],
    url: "https://raw.githubusercontent.com/dathere/qsv/refs/heads/master/contrib/completions/examples/qsv.fish",
  },
  {
    cmds: ["g"],
    url: "https://raw.githubusercontent.com/Equationzhao/g/master/completions/fish/g.fish",
  },
  // One check, two completion files.
  {
    cmds: ["http"],
    outputs: ["http", "https"],
    url: "https://raw.githubusercontent.com/httpie/httpie/master/extras/httpie-completion.fish",
  },
  {
    cmds: ["hx", "helix"],
    outputs: ["hx", "helix"],
    url: "https://raw.githubusercontent.com/helix-editor/helix/master/contrib/completion/hx.fish",
  },
];

/** Tools whose completions only exist inside their release tarball. */
const SHARKDP_CMDS = ["hyperfine", "pastel"];

function buildEntries(): Entry[] {
  const entries: Entry[] = [];

  for (const { args, cmds } of SUBCOMMAND_PATTERNS) {
    for (const cmd of cmds) {
      entries.push({
        requires: [cmd],
        outputs: [cmd],
        recipe: { kind: "stdout", argv: [cmd, ...args] },
      });
    }
  }

  entries.push(...INDIVIDUAL);

  for (const { cmds, outputs, url } of DOWNLOADS) {
    entries.push({ requires: cmds, outputs: outputs ?? cmds, recipe: { kind: "url", url } });
  }

  for (const cmd of SHARKDP_CMDS) {
    entries.push({ requires: [cmd], outputs: [cmd], recipe: { kind: "sharkdp" } });
  }

  return entries;
}

function applies(entry: Entry): boolean {
  if (!entry.requires.some(commandExists)) {
    console.error(`${entry.requires.join(" / ")}: not found`);
    return false;
  }
  for (const name of entry.requiresEnv ?? []) {
    if (!envVarSet(name)) {
      console.error(`${name}: not set`);
      return false;
    }
  }
  if (entry.requiresExecutable !== undefined) {
    // Bun.which resolves absolute paths too, and only when executable.
    if (Bun.which(entry.requiresExecutable) === null) {
      console.error(`${entry.requiresExecutable}: not executable`);
      return false;
    }
  }
  return true;
}

/** Pull one completion file out of the installed sharkdp command's release tarball. */
function sharkdpCommand(cmd: string): string {
  const repo = `sharkdp/${cmd}`;
  const result = Bun.spawnSync({ cmd: [cmd, "--version"], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`could not read the installed ${cmd} version`);
  }
  const versionOutput = new TextDecoder().decode(result.stdout);
  const match = versionOutput.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  if (match === null) {
    throw new Error(`the installed ${cmd} version has no release version: ${versionOutput.trim()}`);
  }
  const version = `v${match[1]}`;

  const archiveName = `${cmd}-${version}-${machineArch()}-unknown-linux-gnu`;
  const archiveFile = `${archiveName}.tar.gz`;
  const url = `https://github.com/${repo}/releases/download/${version}/${archiveFile}`;
  const tempFile = `/tmp/${cmd}-completion.fish`;
  const archivePath = `${archiveName}/autocomplete/${cmd}.fish`;

  // Write to a temp file so a failed download cannot leave an empty completion.
  return `curl -fsSL ${sq(url)} | tar -xzO ${sq(archivePath)} > ${sq(tempFile)} && mv ${sq(tempFile)} ${sq(completionFile(cmd))}`;
}

/** Queue a refresh for every completion this machine can generate. */
export async function enqueue(dispatch: Dispatcher): Promise<void> {
  await dispatch.run("fish -c 'fish_update_completions'");

  for (const entry of buildEntries()) {
    if (!applies(entry)) continue;

    switch (entry.recipe.kind) {
      case "stdout": {
        const [output] = entry.outputs as [string];
        const argv = entry.recipe.argv.map((part, i) => (i === 0 ? sq(part) : part));
        await dispatch.run(`${argv.join(" ")} > ${sq(completionFile(output))}`);
        break;
      }
      case "raw":
        await dispatch.run(entry.recipe.command(entry.outputs));
        break;
      case "url":
        for (const output of entry.outputs) {
          await dispatch.run(`curl -L ${entry.recipe.url} -o ${sq(completionFile(output))}`);
        }
        break;
      case "sharkdp":
        await dispatch.run(sharkdpCommand(entry.outputs[0] as string));
        break;
    }
  }
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
