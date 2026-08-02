/**
 * How a generated command should be carried out.
 *
 * Every original script re-implemented this branch inline as
 * `if [ "$1" == "--no-pueue" ]` / `if ($NoPueue)`. Both silently ignored any
 * other argument; `parseArgs` rejects unknown flags instead.
 */
import { $ } from "bun";
import type { TaskId } from "./pueue.ts";
import * as pueue from "./pueue.ts";

export type Mode =
  /** Enqueue into pueue (default). */
  | "pueue"
  /** Run right here, serially. */
  | "direct"
  /** Print what would happen, touch nothing. */
  | "dry-run";

export type RunOptions = {
  mode: Mode;
  /** Enqueued tasks wait for these to finish (pueue mode only). */
  after: TaskId[];
};

export function parseArgs(argv: readonly string[]): RunOptions {
  const options: RunOptions = { mode: "pueue", after: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--no-pueue":
        options.mode = "direct";
        break;
      case "--dry-run":
        options.mode = "dry-run";
        break;
      case "--after": {
        const value = argv[++i];
        const id = Number.parseInt(value ?? "", 10);
        if (!Number.isInteger(id)) {
          throw new Error(`--after needs a pueue task id, got: ${value ?? "(nothing)"}`);
        }
        options.after.push(id as TaskId);
        break;
      }
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

/** Carry out a single command according to `options`. */
export async function dispatch(options: RunOptions, command: string): Promise<void> {
  switch (options.mode) {
    case "dry-run":
      console.log(pueue.formatAdd(command, { after: options.after }));
      return;
    case "direct":
      // Bun Shell runs the same syntax on Linux and Windows, so the command
      // strings do not need per-platform variants.
      await $`${{ raw: command }}`;
      return;
    case "pueue":
      await pueue.add(command, { after: options.after });
      return;
  }
}

/** Emit a note that is informational only (the tabiew / rustowl HACKs). */
export function note(lines: readonly string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}
