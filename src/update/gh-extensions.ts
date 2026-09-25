#!/usr/bin/env bun
/**
 * Upgrade every gh extension, one task per extension.
 *
 * This used to be a single `gh extensions upgrade --all` line in `all.ts`'s
 * `SIMPLE`, and has the same shape as the `uv tool upgrade --all` that was
 * split on 2026-08-10: one process walks the whole list, so an extension whose
 * release fetch fails takes the run down with it, and which one it was is only
 * visible by reading the log of the single pueue task that held all 18.
 *
 * One task per extension does not make anything run sooner -- pueue's default
 * group is parallel=1 on this machine -- it turns that failure into one named
 * failed row in `pueue status` with the rest of the list still upgraded.
 *
 * Usage: gh-extensions.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { listExtensions } from "../lib/gh.ts";
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";

/** Its own pueue group, one slot, so the extensions queue beside the other groups. */
export const GROUP = { name: "gh", parallel: 1 } as const;

export type GhExtensionsOptions = {
  /** Every upgrade waits for these. */
  after?: readonly Handle[];
};

/** Queue one `gh extension upgrade` per installed extension. */
export async function enqueue(
  dispatch: Dispatcher,
  options: GhExtensionsOptions = {},
): Promise<void> {
  const names = await listExtensions();
  note([`gh: upgrading ${names.length} extensions, one task each`]);
  const gh = await dispatch.inGroup(GROUP.name, GROUP.parallel);

  for (const name of names) {
    await gh.run(`gh extension upgrade ${name}`, options.after);
  }
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
