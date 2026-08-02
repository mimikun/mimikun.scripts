#!/usr/bin/env bun
/**
 * Install everything recorded in the package lists.
 *
 * The mirror image of `src/generate/package-lists.ts`: that writes the lists,
 * this reads them back. Each package manager had its own copy of the same
 * loop -- read a file, enqueue one install per line -- in `install.sh`, in
 * chezmoi and in mimikun.sh, so they are a table here and only the install
 * command differs.
 *
 * Usage: packages.ts [name...] [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 *
 * With no names it installs everything except the Arch lists, matching what
 * `install.sh` did. Those two are opt-in because paru needs a terminal.
 */
import { UNBUILDABLE, unbuildableNote } from "../lib/cargo.ts";
import { commandExists } from "../lib/cmd.ts";
import { pkgListPath, sharedPkgListPath } from "../lib/platform.ts";
import { createDispatcher, note, parseArgs, type RunOptions } from "../lib/runner.ts";

type InstallSpec = {
  /** Selector on the command line. */
  name: string;
  /** Package list to read, OS-prefixed unless `shared`. */
  listFile: string;
  shared?: boolean;
  /** Skip the entry when this command is not installed. */
  requires: string;
  /** The command that installs one package. */
  install: (pkg: string) => string;
  /** Leave packages that are already on PATH alone. */
  skipIfOnPath?: boolean;
  /**
   * Packages that need something other than the usual command: a string
   * replaces it, `null` skips the package and prints `skipNote`.
   */
  overrides?: Record<string, string | null>;
  skipNote?: (pkg: string) => string[];
  /** Commands to run after the list is done. */
  extra?: string[];
  /**
   * Run in the foreground even in pueue mode, and keep going after a failure.
   * paru asks for a sudo password, which a detached task cannot answer.
   */
  foreground?: boolean;
  /** Not installed unless asked for by name. */
  optIn?: boolean;
};

const LISTS: InstallSpec[] = [
  {
    name: "arch-official",
    listFile: "arch_official_packages.txt",
    requires: "paru",
    install: (pkg) => `paru -S --noconfirm ${pkg}`,
    foreground: true,
    optIn: true,
  },
  {
    name: "arch-aur",
    listFile: "arch_aur_packages.txt",
    requires: "paru",
    install: (pkg) => `paru -S --noconfirm ${pkg}`,
    foreground: true,
    optIn: true,
  },
  {
    name: "cargo",
    listFile: "cargo_packages.txt",
    requires: "cargo",
    install: (pkg) => `cargo install ${pkg}`,
    skipIfOnPath: true,
    overrides: Object.fromEntries([...UNBUILDABLE].map((pkg) => [pkg, null])),
    skipNote: unbuildableNote,
    extra: ["cargo install --git https://github.com/Adarsh-Roy/gthr --locked"],
  },
  {
    name: "gh-extension",
    listFile: "gh_extension_list.txt",
    shared: true,
    requires: "gh",
    install: (pkg) => `gh extension install ${pkg}`,
  },
  {
    name: "pip",
    listFile: "pip_packages.txt",
    requires: "pip",
    install: (pkg) => `pip install ${pkg}`,
    overrides: {
      // Pinned: later releases broke on this setup.
      thefuck:
        "pip install 'thefuck @ git+https://github.com/nvbn/thefuck@62e0767c5069aeee176b0fe3459068b7703aaa26'",
    },
  },
  {
    name: "pipx",
    listFile: "pipx_packages.txt",
    requires: "pipx",
    install: (pkg) => `pipx install ${pkg}`,
  },
  {
    name: "pnpm",
    listFile: "pnpm_packages.txt",
    requires: "pnpm",
    install: (pkg) => `pnpm install --global ${pkg}`,
  },
  {
    name: "uv",
    listFile: "uv_tools.txt",
    requires: "uv",
    install: (pkg) => `uv tool install ${pkg}`,
  },
];

function listPath(spec: InstallSpec): string {
  return spec.shared ? sharedPkgListPath(spec.listFile) : pkgListPath(spec.listFile);
}

async function readPackageList(path: string): Promise<string[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`package list not found: ${path}`);
  }
  return (await file.text())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** The command for one package, or null when it should be skipped. */
function commandFor(spec: InstallSpec, pkg: string): string | null {
  if (spec.skipIfOnPath && commandExists(pkg)) return null;

  const override = spec.overrides?.[pkg];
  if (override === null) {
    note(spec.skipNote?.(pkg) ?? [`${pkg}: skipped`]);
    return null;
  }
  return override ?? spec.install(pkg);
}

async function install(spec: InstallSpec, options: RunOptions): Promise<void> {
  // paru cannot run detached, so it stays in the foreground unless this is a
  // dry run, which prints either way.
  const mode = spec.foreground && options.mode === "pueue" ? "direct" : options.mode;
  const dispatch = createDispatcher({ ...options, mode });

  const packages = await readPackageList(listPath(spec));
  console.error(`${spec.name}: ${packages.length} in the list`);

  for (const pkg of packages) {
    const command = commandFor(spec, pkg);
    if (command === null) continue;

    console.error(`Install: ${pkg}`);
    if (!spec.foreground) {
      await dispatch.run(command);
      continue;
    }
    // Report and carry on, the way the shell version's ✓/✗ loop did.
    try {
      await dispatch.run(command);
      console.error(`✓ Successfully installed: ${pkg}`);
    } catch {
      console.error(`✗ Failed to install: ${pkg}`);
    }
  }

  for (const command of spec.extra ?? []) {
    await dispatch.run(command);
  }
}

/**
 * List names and dispatcher flags can be interleaved. `--after` takes the
 * argument that follows it, so its value is not mistaken for a list name.
 */
function splitArgs(argv: readonly string[]): { selected: string[]; flags: string[] } {
  const selected: string[] = [];
  const flags: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("-")) {
      selected.push(arg);
    } else if (arg === "--after") {
      flags.push(arg, argv[++i] ?? "");
    } else {
      flags.push(arg);
    }
  }
  return { selected, flags };
}

function selectSpecs(selected: readonly string[]): InstallSpec[] {
  for (const name of selected) {
    if (!LISTS.some((spec) => spec.name === name)) {
      throw new Error(`unknown list: ${name} (have ${LISTS.map((s) => s.name).join(", ")})`);
    }
  }
  if (selected.length > 0) return LISTS.filter((spec) => selected.includes(spec.name));
  return LISTS.filter((spec) => spec.optIn !== true);
}

async function main(): Promise<void> {
  const { selected, flags } = splitArgs(process.argv.slice(2));
  const specs = selectSpecs(selected);
  const options = parseArgs(flags);

  const failures: string[] = [];
  for (const spec of specs) {
    if (!commandExists(spec.requires)) {
      console.error(`${spec.name}: ${spec.requires} not found, skipping`);
      continue;
    }
    try {
      await install(spec, options);
    } catch (error) {
      failures.push(`${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
}

await main();
