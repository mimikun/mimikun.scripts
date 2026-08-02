#!/usr/bin/env bun
/**
 * Reinstall every cargo package that has a newer version available.
 *
 * Replaces `vup.sh`'s cargo section, `mimikun.sh/src/update/cargo-packages.sh`,
 * and `powershell/Invoke-UpdateCargoPackage.ps1`.
 *
 * Usage: cargo-packages.ts [--no-pueue | --dry-run] [--after <task-id>]...
 *
 * `vup.sh` runs `rustup update` first and makes every `cargo install` wait for
 * it, so it passes that task id via `--after`.
 */
import { UNBUILDABLE, listPackages, unbuildableNote } from "../lib/cargo.ts";
import { dispatch, note, parseArgs } from "../lib/runner.ts";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outdated = (await listPackages()).filter((pkg) => pkg.needsUpdate);

  console.error("Update these packages:");
  for (const pkg of outdated) {
    console.error(`  ${pkg.name} ${pkg.installed} -> ${pkg.latest}`);
  }

  for (const pkg of outdated) {
    if (UNBUILDABLE.has(pkg.name)) {
      note(unbuildableNote(pkg.name));
      continue;
    }
    await dispatch(options, `cargo install ${pkg.name}`);
  }
}

await main();
