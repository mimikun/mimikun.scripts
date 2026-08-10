#!/usr/bin/env bun
/**
 * Upgrade every uv tool, one task per tool.
 *
 * This used to be a single `uv tool upgrade --all` line in `all.ts`'s `SIMPLE`.
 * `--all` walks the tools in one process and stops at the first one that fails,
 * so a single broken build left every tool after it un-upgraded, and finding
 * which one it was meant reading the log of the one pueue task that held all of
 * them. One task per tool costs nothing extra -- pueue's default group runs one
 * task at a time either way -- and turns that into a failed row in
 * `pueue status` next to the tool's name, with the rest of the list still run.
 *
 * No interpreter is passed. `uv tool upgrade` keeps whatever Python a tool was
 * built against, which is the whole reason this file holds no table of tools or
 * versions: the list comes from `uv tool list` at run time. See `src/lib/uv.ts`
 * for why reinstalling is the direction that does need the version.
 *
 * Usage: uv-tools.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";
import { listTools } from "../lib/uv.ts";

export type UvToolsOptions = {
  /** Every upgrade waits for these. */
  after?: readonly Handle[];
};

/** Queue one `uv tool upgrade` per installed tool. */
export async function enqueue(dispatch: Dispatcher, options: UvToolsOptions = {}): Promise<void> {
  const tools = await listTools();
  note([`uv: upgrading ${tools.length} tools, one task each`]);

  for (const tool of tools) {
    await dispatch.run(`uv tool upgrade ${tool.name}`, options.after);
  }
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
