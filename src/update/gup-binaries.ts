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
 * made it wait for the single `gup update`. It writes
 * `~/.config/gup/gup.json` from what is installed, so exporting before the
 * rebuilds would record the old versions.
 *
 * The file it writes is `gup.json`, not `gup.conf`. `gup.conf` was the older
 * format and stopped being written at some point; the copy left behind here
 * had last been updated on 2026-02-14 and had drifted to 110 entries against
 * the 292 gup actually manages, which is long enough for a survey to be
 * planned against the wrong list. It has been deleted.
 *
 * Everything here goes into its own pueue group with one slot. Two `gup
 * update`s at once get blocked, and the `default` group is where the parallel
 * count is meant to go up; a group of its own keeps gup at one regardless of
 * what `default` is set to.
 *
 * Usage: gup-binaries.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { listBinaries } from "../lib/gup.ts";
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";

/** Two concurrent `gup update`s get blocked, so this group never goes above one. */
const GROUP = { name: "gup", parallel: 1 } as const;

export type GupOptions = {
  /** Every update waits for these. */
  after?: readonly Handle[];
};

/** Queue one `gup update` per binary, then `gup export` behind all of them. */
export async function enqueue(dispatch: Dispatcher, options: GupOptions = {}): Promise<void> {
  const names = await listBinaries();
  note([`gup: updating ${names.length} binaries, one task each`]);
  const gup = await dispatch.inGroup(GROUP.name, GROUP.parallel);

  // Kept so the export waits for exactly these. Passing only the last update
  // would let the export run while earlier rebuilds were still queued.
  const updates: Handle[] = [];
  for (const name of names) {
    updates.push(await gup.run(`gup update ${name}`, options.after));
  }

  await gup.run("gup export", updates.length > 0 ? updates : options.after);
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
