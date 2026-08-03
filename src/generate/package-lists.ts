#!/usr/bin/env bun
/**
 * Record what is installed, one file per package manager.
 *
 * Replaces the pipelines in `generate.sh` and the one-per-manager scripts that
 * were duplicated in chezmoi and mimikun.sh. Every one of them was the same
 * shape -- run a command, cut a field out of each line, sort, redirect -- so
 * they are a table here, and only the field-cutting differs.
 *
 * Usage: package-lists.ts [name...]     (no names means all of them)
 */
import { parseInstallUpdateList } from "../lib/cargo.ts";
import { commandExists } from "../lib/cmd.ts";
import { pkgListPath, sharedPkgListPath } from "../lib/platform.ts";
import { formatToolLine, parseToolList } from "../lib/uv.ts";

type ListSpec = {
  /** Selector on the command line. */
  name: string;
  /** Output file name, OS-prefixed unless `shared`. */
  file: string;
  shared?: boolean;
  /** Skip the entry when this command is not installed. */
  requires: string;
  argv: string[];
  /** Turn the command's stdout into package names. */
  parse: (stdout: string) => string[];
};

/** Every non-blank line is a package name. */
function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

const LISTS: ListSpec[] = [
  // `pacman -Qq` reads the local database, which is world-readable, so the
  // `sudo` the shell versions used was never needed.
  {
    name: "arch-official",
    file: "arch_official_packages.txt",
    requires: "pacman",
    argv: ["pacman", "-Qqen"],
    parse: lines,
  },
  {
    name: "arch-aur",
    file: "arch_aur_packages.txt",
    requires: "pacman",
    argv: ["pacman", "-Qqem"],
    parse: lines,
  },
  {
    name: "cargo",
    file: "cargo_packages.txt",
    requires: "cargo",
    argv: ["cargo", "install-update", "--list"],
    parse: (stdout) => parseInstallUpdateList(stdout).map((pkg) => pkg.name),
  },
  {
    name: "pip",
    // `name==version`, or `name @ git+https://...` for a VCS install.
    file: "pip_packages.txt",
    requires: "pip",
    argv: ["pip", "freeze"],
    parse: (stdout) => lines(stdout).map((line) => line.replace(/[=@].*$/, "").trim()),
  },
  {
    name: "pipx",
    // `name version`
    file: "pipx_packages.txt",
    requires: "pipx",
    argv: ["pipx", "list", "--short"],
    parse: (stdout) => lines(stdout).map((line) => line.split(" ")[0] as string),
  },
  {
    name: "pnpm",
    file: "pnpm_packages.txt",
    requires: "pnpm",
    argv: ["pnpm", "list", "--global", "--json"],
    parse: (stdout) => {
      const roots = JSON.parse(stdout) as { dependencies?: Record<string, unknown> }[];
      return roots.flatMap((root) => Object.keys(root.dependencies ?? {}));
    },
  },
  {
    name: "uv",
    // `--show-python` adds the interpreter, which the list has to carry: see
    // `src/lib/uv.ts` for why a bare name is not enough to reinstall with.
    file: "uv_tools.txt",
    requires: "uv",
    argv: ["uv", "tool", "list", "--show-python"],
    parse: (stdout) => parseToolList(stdout).map(formatToolLine),
  },
  {
    name: "rubygem",
    // `name (1.2.3, 1.2.2)`
    file: "rubygem_list.txt",
    requires: "gem",
    argv: ["gem", "list"],
    parse: (stdout) => lines(stdout).map((line) => line.replace(/ \(.*$/, "")),
  },
  {
    name: "gh-extension",
    // `gh <alias>\t<owner>/<repo>\t<version>`; the repo is what installs again.
    file: "gh_extension_list.txt",
    shared: true,
    requires: "gh",
    argv: ["gh", "extension", "list"],
    parse: (stdout) => lines(stdout).map((line) => line.split(/\s+/)[2] as string),
  },
];

function outputPath(spec: ListSpec): string {
  return spec.shared ? sharedPkgListPath(spec.file) : pkgListPath(spec.file);
}

async function generate(spec: ListSpec): Promise<void> {
  const argv = spec.argv;
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    // The shell versions redirected regardless, so a failing command truncated
    // the list to nothing. Leave the previous contents alone instead.
    throw new Error(`${argv.join(" ")} failed (exit ${code}); ${spec.file} left as it was`);
  }

  // `LC_ALL=C sort` in the originals: byte order, not locale order.
  const names = spec.parse(stdout).sort();
  const destination = outputPath(spec);
  await Bun.write(destination, names.map((name) => `${name}\n`).join(""));
  console.error(`${spec.name}: wrote ${names.length} to ${destination}`);
}

async function main(): Promise<void> {
  const selected = process.argv.slice(2);
  for (const name of selected) {
    if (!LISTS.some((spec) => spec.name === name)) {
      throw new Error(`unknown list: ${name} (have ${LISTS.map((s) => s.name).join(", ")})`);
    }
  }
  const specs = selected.length > 0 ? LISTS.filter((s) => selected.includes(s.name)) : LISTS;

  // One broken package manager should not stop the others from being recorded.
  const failures: string[] = [];
  for (const spec of specs) {
    if (!commandExists(spec.requires)) {
      console.error(`${spec.name}: ${spec.requires} not found, skipping`);
      continue;
    }
    try {
      await generate(spec);
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
