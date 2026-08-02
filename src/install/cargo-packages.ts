#!/usr/bin/env bun
/**
 * Install any cargo package from the package list that is not on PATH yet.
 *
 * Replaces `install.sh`'s cargo section, `mimikun.sh/src/install/cargo-packages.sh`,
 * and `powershell/Invoke-InstallCargoPackage.ps1`.
 *
 * Usage: cargo-packages.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { UNBUILDABLE, unbuildableNote } from "../lib/cargo.ts";
import { commandExists } from "../lib/cmd.ts";
import { pkgListPath } from "../lib/platform.ts";
import { createDispatcher, note, parseArgs } from "../lib/runner.ts";

/** Packages installed from a git remote rather than crates.io. */
const GIT_SOURCES = ["https://github.com/Adarsh-Roy/gthr"];

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

async function main(): Promise<void> {
  const dispatch = createDispatcher(parseArgs(process.argv.slice(2)));
  const packages = await readPackageList(pkgListPath("cargo_packages.txt"));

  for (const name of packages) {
    if (commandExists(name)) continue;

    console.log(`${name} is not found`);
    if (UNBUILDABLE.has(name)) {
      note(unbuildableNote(name));
      continue;
    }
    await dispatch(`cargo install ${name}`);
  }

  for (const url of GIT_SOURCES) {
    await dispatch(`cargo install --git ${url} --locked`);
  }
}

await main();
