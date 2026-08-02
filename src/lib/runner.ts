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
  /** Enqueued tasks wait for these to finish. */
  after: TaskId[];
  /**
   * Chain the enqueued tasks so each waits for the previous one, keeping only
   * one cargo build running at a time. The chezmoi copies did this by hand
   * with a dummy `echo TEMP_TASK` head task; here the first real task simply
   * inherits `after` and every later one depends on its predecessor.
   */
  serial: boolean;
};

export function parseArgs(argv: readonly string[]): RunOptions {
  const options: RunOptions = { mode: "pueue", after: [], serial: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--no-pueue":
        options.mode = "direct";
        break;
      case "--dry-run":
        options.mode = "dry-run";
        break;
      case "--serial":
        options.serial = true;
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

/** Runs commands according to `options`, carrying `--serial` state between them. */
export type Dispatcher = (command: string) => Promise<void>;

export function createDispatcher(options: RunOptions): Dispatcher {
  // In `--serial` mode this holds the task the next one must wait for. In
  // dry-run there are no real ids, so a counter stands in for display.
  let previous: TaskId | undefined;
  let dryRunCounter = 0;

  return async (command: string): Promise<void> => {
    const after = options.serial && previous !== undefined ? [previous] : options.after;

    switch (options.mode) {
      case "dry-run": {
        const shown = options.serial && dryRunCounter > 0 ? [`#${dryRunCounter}`] : after;
        dryRunCounter++;
        console.log(pueue.formatAdd(command, { after: shown }));
        return;
      }
      case "direct":
        // Bun Shell runs the same syntax on Linux and Windows, so the command
        // strings do not need per-platform variants.
        await $`${{ raw: command }}`;
        return;
      case "pueue":
        if (options.serial) {
          previous = await pueue.addWithId(command, { after });
        } else {
          await pueue.add(command, { after });
        }
        return;
    }
  };
}

/** Emit a note that is informational only (the tabiew / rustowl HACKs). */
export function note(lines: readonly string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}
