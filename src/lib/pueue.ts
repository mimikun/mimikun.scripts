/**
 * Typed wrapper around `pueue add`.
 *
 * `pueue add -p` prints the new task id, which the shell originals captured
 * into bare strings and threaded through `--after`. `TaskId` is branded so a
 * plain number cannot be passed as a dependency by accident.
 */

declare const taskIdBrand: unique symbol;

export type TaskId = number & { readonly [taskIdBrand]: true };

export type AddOptions = {
  /** Run only after all of these tasks have finished successfully. */
  after?: readonly TaskId[];
  /** Queue into this group instead of `default`. It must already exist. */
  group?: string;
};

function addArgs(command: string, options: AddOptions): string[] {
  const args = ["add"];
  if (options.group !== undefined) {
    args.push("--group", options.group);
  }
  const after = options.after ?? [];
  if (after.length > 0) {
    args.push("--after", ...after.map(String));
  }
  args.push("--", command);
  return args;
}

/**
 * Render the `pueue` invocation as a shell-ish line, for `--dry-run` output.
 * `after` also accepts placeholder strings, since a dry run has no real ids.
 */
export function formatAdd(
  command: string,
  options: { after?: readonly (TaskId | string)[]; group?: string } = {},
): string {
  const args = ["add"];
  if (options.group !== undefined) {
    args.push("--group", options.group);
  }
  const after = options.after ?? [];
  if (after.length > 0) {
    args.push("--after", ...after.map(String));
  }
  args.push("--", command);
  return `pueue ${args.join(" ")}`;
}

/** Enqueue a task without caring about its id. */
export async function add(command: string, options: AddOptions = {}): Promise<void> {
  const proc = Bun.spawn(["pueue", ...addArgs(command, options)], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`pueue add failed (exit ${code}): ${command}`);
  }
}

/** Enqueue a task and return its id, for use as a dependency of a later task. */
export async function addWithId(command: string, options: AddOptions = {}): Promise<TaskId> {
  const args = addArgs(command, options);
  // -p must precede the `--` separator, so splice it in ahead of the command.
  const sep = args.indexOf("--");
  args.splice(sep, 0, "--print-task-id");

  const proc = Bun.spawn(["pueue", ...args], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`pueue add failed (exit ${code}): ${command}`);
  }

  const id = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(id)) {
    throw new Error(`pueue add did not return a task id: ${JSON.stringify(stdout)}`);
  }
  return id as TaskId;
}

/**
 * The commands that make `name` exist with exactly `parallel` slots.
 *
 * `pueue group add` fails when the group is already there, so the group list
 * is read first rather than the error being swallowed: a swallowed error would
 * also hide a daemon that is not running. An existing group still gets
 * `pueue parallel`, so a value changed by hand does not survive the next run.
 */
export function groupSetupArgs(
  existing: readonly string[],
  name: string,
  parallel: number,
): string[] {
  if (existing.includes(name)) {
    return ["parallel", String(parallel), "--group", name];
  }
  return ["group", "add", name, "--parallel", String(parallel)];
}

/** Names of the groups the daemon currently has. */
export async function listGroups(): Promise<string[]> {
  const proc = Bun.spawn(["pueue", "group", "--json"], { stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`pueue group --json failed (exit ${code})`);
  }
  return Object.keys(JSON.parse(stdout) as Record<string, unknown>);
}

/** Create `name` with `parallel` slots, or reset an existing one to that value. */
export async function ensureGroup(name: string, parallel: number): Promise<void> {
  const args = groupSetupArgs(await listGroups(), name, parallel);
  const code = await Bun.spawn(["pueue", ...args], { stdout: "inherit", stderr: "inherit" }).exited;
  if (code !== 0) {
    throw new Error(`pueue ${args.join(" ")} failed (exit ${code})`);
  }
}
