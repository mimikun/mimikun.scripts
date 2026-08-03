#!/usr/bin/env bun
/**
 * Reinstall every cargo package that has a newer version available.
 *
 * Replaces `vup.sh`'s cargo section, `mimikun.sh/src/update/cargo-packages.sh`,
 * and `powershell/Invoke-UpdateCargoPackage.ps1`.
 *
 * Usage: cargo-packages.ts [--generate-list] [--no-pueue | --dry-run] [--serial]
 *                          [--after <task-id>]...
 *
 * `vup.sh` runs `rustup update` first and makes every `cargo install` wait for
 * it, so it passes that task id via `--after`. It also passes `--generate-list`
 * so the recorded package list is rewritten once the installs are done.
 */
import { dirname, join } from "node:path";
import { listPackages, UNBUILDABLE, unbuildableNote } from "../lib/cargo.ts";
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";
import { sq } from "../lib/shell.ts";

/** Rewrite `~/.mimikun-pkglists/<os>_cargo_packages.txt` from what is installed. */
function generateListCommand(): string {
  const script = join(dirname(import.meta.dir), "generate", "package-lists.ts");
  return `bun run ${sq(script)} cargo`;
}

export type CargoOptions = {
  /** Every install waits for this, which `vup` uses for `rustup update`. */
  after?: readonly Handle[];
  /** Rewrite the recorded package list once every install has finished. */
  generateList?: boolean;
};

/** Queue an install for every cargo package that has a newer version. */
export async function enqueue(dispatch: Dispatcher, options: CargoOptions = {}): Promise<void> {
  const outdated = (await listPackages()).filter((pkg) => pkg.needsUpdate);

  console.error("Update these packages:");
  for (const pkg of outdated) {
    console.error(`  ${pkg.name} ${pkg.installed} -> ${pkg.latest}`);
  }

  // Kept so the list regeneration can wait for exactly these and nothing else.
  // `vup` used to write that as `--after "$task_id"` with whichever install the
  // loop left behind, which with parallel installs waited for only one of them.
  const installs: Handle[] = [];
  for (const pkg of outdated) {
    if (UNBUILDABLE.has(pkg.name)) {
      note(unbuildableNote(pkg.name));
      continue;
    }
    installs.push(await dispatch.run(`cargo install ${pkg.name}`, options.after));
  }

  if (options.generateList === true) {
    await dispatch.run(generateListCommand(), installs.length > 0 ? installs : options.after);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // `--generate-list` is ours, not the dispatcher's, so keep it out of parseArgs.
  const generateList = argv.includes("--generate-list");
  const dispatch = createDispatcher(parseArgs(argv.filter((a) => a !== "--generate-list")));
  await enqueue(dispatch, { generateList });
}

if (import.meta.main) await main();
