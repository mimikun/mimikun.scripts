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

/** A task id, or the `#n` placeholder a dry run prints in its place. */
type Handle = TaskId | string;

export type Dispatcher = {
  /** Carry out one command. */
  run(command: string): Promise<void>;
  /**
   * Carry out commands in order, each waiting for the one before it. Used where
   * the steps are a single unit -- download, unpack, copy, clean up -- so they
   * chain even when `--serial` is off.
   */
  runChain(commands: readonly string[]): Promise<void>;
  /**
   * Carry out `command` once every task enqueued so far has finished. Used for
   * the step that records the result of the others, such as regenerating the
   * cargo package list after the installs.
   *
   * `vup` used to write this as `--after "$task_id"` where `$task_id` was
   * whichever install happened to be queued last. With the installs running in
   * parallel that only ever waited for one of them, so the list could be
   * written while the rest were still building.
   */
  runAfterAll(command: string): Promise<void>;
};

export function createDispatcher(options: RunOptions): Dispatcher {
  // In `--serial` mode this is the task the next one must wait for. A dry run
  // has no real ids, so a counter stands in for display.
  let previous: Handle | undefined;
  let synthetic = 0;
  // Everything this dispatcher has enqueued, for `runAfterAll`.
  const enqueued: Handle[] = [];

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

  /** `enqueue`, remembering the handle so `runAfterAll` can wait on it. */
  async function track(command: string, after: readonly Handle[]): Promise<Handle> {
    const handle = await enqueue(command, after);
    enqueued.push(handle);
    return handle;
  }

  /** What a new unit of work should wait for before it starts. */
  function head(): readonly Handle[] {
    if (options.serial && previous !== undefined) return [previous];
    return options.after;
  }

  return {
    async run(command: string): Promise<void> {
      previous = await track(command, head());
    },

    async runChain(commands: readonly string[]): Promise<void> {
      let waitFor = head();
      for (const command of commands) {
        const id = await track(command, waitFor);
        waitFor = [id];
      }
      // A later `--serial` task queues behind the whole chain, not part of it.
      previous = waitFor[0];
    },

    async runAfterAll(command: string): Promise<void> {
      // With nothing enqueued there is nothing to wait for, so this falls back
      // to whatever the caller was told to wait for.
      const after = enqueued.length > 0 ? enqueued : options.after;
      previous = await track(command, after);
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
