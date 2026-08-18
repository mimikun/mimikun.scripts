#!/usr/bin/env bun
/**
 * Rebuild every `go install`-ed binary, one task per binary, then export the
 * list.
 *
 * This used to be the `["gup update", "gup export"]` chain in `all.ts`'s
 * `CHAINS`. `gup update` compiles all 296 binaries in one process with the
 * current Go toolchain; a single package whose upstream has moved, been
 * retracted, or stopped building on this Go version is then one line inside one
 * pueue task's log. Per binary, it is a named failed row in `pueue status`.
 *
 * `gup export` still runs last and waits for every update, the way the chain
 * made it wait for the single `gup update`. It writes `~/.config/gup/gup.conf`
 * from what is installed, so exporting before the rebuilds would record the old
 * versions.
 *
 * Usage: gup-binaries.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { listBinaries } from "../lib/gup.ts";
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";

export type GupOptions = {
  /** Every update waits for these. */
  after?: readonly Handle[];
};

/** Queue one `gup update` per binary, then `gup export` behind all of them. */
export async function enqueue(dispatch: Dispatcher, options: GupOptions = {}): Promise<void> {
  const names = await listBinaries();
  note([`gup: updating ${names.length} binaries, one task each`]);

  // Kept so the export waits for exactly these. Passing only the last update
  // would let the export run while earlier rebuilds were still queued.
  const updates: Handle[] = [];
  for (const name of names) {
    updates.push(await dispatch.run(`gup update ${name}`, options.after));
  }

  await dispatch.run("gup export", updates.length > 0 ? updates : options.after);
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
