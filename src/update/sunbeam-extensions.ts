#!/usr/bin/env bun
/**
 * Upgrade every sunbeam extension, one task per extension.
 *
 * Same reasoning as `gh-extensions.ts` and `uv-tools.ts`: `sunbeam extension
 * upgrade --all` is one process over the whole list, so one extension whose
 * source has moved hides the rest.
 *
 * Usage: sunbeam-extensions.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";
import { listExtensions } from "../lib/sunbeam.ts";

/** Its own pueue group, one slot, so the extensions queue beside the other groups. */
export const GROUP = { name: "sunbeam", parallel: 1 } as const;

export type SunbeamExtensionsOptions = {
  /** Every upgrade waits for these. */
  after?: readonly Handle[];
};

/** Queue one `sunbeam extension upgrade` per installed extension. */
export async function enqueue(
  dispatch: Dispatcher,
  options: SunbeamExtensionsOptions = {},
): Promise<void> {
  const names = await listExtensions();
  note([`sunbeam: upgrading ${names.length} extensions, one task each`]);
  const sunbeam = await dispatch.inGroup(GROUP.name, GROUP.parallel);

  for (const name of names) {
    await sunbeam.run(`sunbeam extension upgrade ${name}`, options.after);
  }
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
