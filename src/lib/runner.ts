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
   * one build running at a time. The chezmoi copies did this by hand with a
   * dummy `echo TEMP_TASK` head task; here the first real task simply inherits
   * `after` and every later one depends on its predecessor.
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

/**
 * A task id, or the `#n` placeholder a dry run prints in its place.
 *
 * Steps hand these to each other so a dependency never has to be spelled out
 * as a number on a command line. `vup` used to pass real pueue ids to child
 * processes as `--after 42`, which meant a dry run had nothing to pass.
 */
export type Handle = TaskId | string;

export type Dispatcher = {
  /** Carry out one command, handing back something later steps can wait for. */
  run(command: string, after?: readonly Handle[]): Promise<Handle>;
  /**
   * Carry out commands in order, each waiting for the one before it. Used where
   * the steps are a single unit -- download, unpack, copy, clean up -- so they
   * chain even when `--serial` is off. Hands back the tail of the chain.
   */
  runChain(commands: readonly string[], after?: readonly Handle[]): Promise<Handle>;
};

export function createDispatcher(options: RunOptions): Dispatcher {
  // In `--serial` mode this is the task the next one must wait for. A dry run
  // has no real ids, so a counter stands in for display.
  let previous: Handle | undefined;
  let synthetic = 0;

  async function enqueue(command: string, after: readonly Handle[]): Promise<Handle> {
    switch (options.mode) {
      case "dry-run":
        synthetic += 1;
        console.log(pueue.formatAdd(command, { after }));
        return `#${synthetic}`;
      case "direct":
        // Bun Shell runs the same syntax on Linux and Windows, so the command
        // strings do not need per-platform variants.
        await $`${{ raw: command }}`;
        return "";
      case "pueue":
        return await pueue.addWithId(command, { after: after as readonly TaskId[] });
    }
  }

  /** What a new unit of work should wait for before it starts. */
  function head(): readonly Handle[] {
    if (options.serial && previous !== undefined) return [previous];
    return options.after;
  }

  return {
    async run(command: string, after?: readonly Handle[]): Promise<Handle> {
      previous = await enqueue(command, after ?? head());
      return previous;
    },

    async runChain(commands: readonly string[], after?: readonly Handle[]): Promise<Handle> {
      let waitFor = after ?? head();
      for (const command of commands) {
        const id = await enqueue(command, waitFor);
        waitFor = [id];
      }
      // A later `--serial` task queues behind the whole chain, not part of it.
      previous = waitFor[0];
      return previous ?? "";
    },
  };
}

/**
 * Emit a note that is informational only (the tabiew / rustowl HACKs).
 *
 * Commentary goes to stderr so that stdout carries nothing but the commands
 * `--dry-run` would enqueue, and can be diffed against another run.
 */
export function note(lines: readonly string[]): void {
  for (const line of lines) {
    console.error(line);
  }
}
