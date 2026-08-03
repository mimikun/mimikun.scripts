#!/usr/bin/env bun
/**
 * Update everything. The body of `vup.sh`.
 *
 * The shell version spelled its dependencies as pueue task ids passed between
 * commands -- `task_id=$(pueue add -p ...)` then `--after "$task_id"`, and for
 * the migrated steps that id crossed a process boundary as a command-line
 * argument. That is why `vup` never had a dry run: with nothing enqueued there
 * is no id to hand over. Here every step shares one dispatcher, so a dependency
 * is a value and `--dry-run` prints the whole plan without touching anything.
 *
 * Usage: all.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { commandExists } from "../lib/cmd.ts";
import { osName } from "../lib/platform.ts";
import { createDispatcher, type Dispatcher, type Handle, note, parseArgs } from "../lib/runner.ts";
import { enqueue as enqueueCargo } from "./cargo-packages.ts";
import { enqueue as enqueueCompose } from "./docker-compose.ts";
import { enqueue as enqueueFishCompletions } from "./fish-completions.ts";
import { enqueue as enqueueMiseRefs } from "./mise-refs.ts";

/**
 * The OS package managers, keyed by the command that says which OS this is.
 *
 * The shell version branched on `os_info -t` against three hard-coded strings,
 * which meant an OS it did not know about silently did nothing, and the Mac arm
 * called a `brew_update` that does not exist anywhere. Asking whether the
 * command is on PATH answers the same question without a lookup table of OS
 * names, and a machine with both paru and Homebrew gets both.
 *
 * All of these run in the foreground: they want a terminal for their sudo
 * prompt and their conflict questions.
 */
const OS_PACKAGES: { requires: string; steps: string[][] }[] = [
  // paru wraps pacman and covers the AUR, so pacman is not called separately.
  { requires: "paru", steps: [["paru", "-Syu"]] },
  {
    requires: "apt",
    steps: [
      ["sudo", "apt", "update"],
      ["sudo", "apt", "upgrade", "-y"],
      ["sudo", "apt", "autoremove", "-y"],
      ["sudo", "apt-get", "clean"],
    ],
  },
  {
    requires: "brew",
    steps: [
      ["brew", "update"],
      ["brew", "upgrade"],
      // Casks are macOS only; on Linuxbrew the flag is not accepted.
      ...(osName() === "darwin" ? [["brew", "upgrade", "--cask"]] : []),
      ["brew", "cleanup"],
    ],
  },
];

/**
 * Steps that are one command with no dependants. The shell version wrote each
 * of these as its own `echo` plus `pueue add` pair; the only thing that varied
 * was the command, so they are a list.
 */
const SIMPLE: { requires: string; command: string }[] = [
  { requires: "deno", command: "deno upgrade" },
  { requires: "bun", command: "bun upgrade" },
  { requires: "tldr", command: "tldr --update" },
  { requires: "gh", command: "gh extensions upgrade --all" },
  { requires: "flyctl", command: "flyctl version upgrade" },
  { requires: "pnpm", command: "pnpm self-update" },
  { requires: "sunbeam", command: "sunbeam extension upgrade --all" },
  { requires: "cargo-cache", command: "cargo cache -a" },
  // Without `--python` this rebuilds each tool against the interpreter it
  // already has, so the version spread across the installed tools is uv's
  // problem rather than something this repo has to model. That is also why
  // there is no `src/update/uv-tools.ts`: there is nothing to decide per tool.
  { requires: "uv", command: "uv tool upgrade --all" },
];

/**
 * Steps that are a fixed sequence, each waiting for the one before it. These
 * were the hand-threaded `task_id=$(pueue add -p --after "$task_id" ...)`
 * ladders, which is exactly what `runChain` does.
 */
const CHAINS: { requires: string; commands: string[] }[] = [
  {
    requires: "bob",
    commands: [
      "bob use latest",
      "bob update nightly",
      "bob use nightly",
      "bob update stable",
      "bob update latest",
      "bob install head",
    ],
  },
  { requires: "gup", commands: ["gup update", "gup export"] },
  {
    requires: "aqua",
    commands: [
      "aqua update-aqua",
      "aqua install --all",
      "aqua update",
      "aqua install --all",
      "aqua vacuum",
    ],
  },
];

/** Run a command here and now, reporting rather than aborting on failure. */
async function foreground(label: string, argv: readonly string[]): Promise<void> {
  console.error(label);
  const proc = Bun.spawn(argv as string[], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) {
    console.error(`${label}: failed, carrying on`);
  }
}

/** Do the work only when `name` is on PATH, saying so when it is not. */
async function ifPresent(name: string, body: () => Promise<void>): Promise<void> {
  if (commandExists(name)) {
    await body();
    return;
  }
  note([`${name}: not found`]);
}

/** Run here and now, or during a dry run just say what would have run. */
async function foregroundStep(argv: readonly string[], dryRun: boolean): Promise<void> {
  if (dryRun) {
    note([`would run: ${argv.join(" ")}`]);
    return;
  }
  await foreground(argv.join(" "), argv);
}

/** The tasks that go into pueue, and the one root the cargo builds wait for. */
async function enqueueAll(dispatch: Dispatcher, dryRun: boolean): Promise<void> {
  let rustup: Handle | undefined;
  await ifPresent("rustup", async () => {
    rustup = await dispatch.run("rustup update");
  });

  await ifPresent("mise", async () => {
    const mise = await dispatch.run("mise upgrade");
    // `mise upgrade` already covers vim@latest and zig@master. The one pin it
    // cannot refresh is vim@ref:master: the version string stays "ref:master"
    // however far upstream moves, so it never turns up in `mise outdated`.
    await enqueueMiseRefs(dispatch, { dryRun, after: [mise] });
  });

  for (const { requires, command } of SIMPLE) {
    await ifPresent(requires, () => dispatch.run(command).then(() => undefined));
  }
  for (const { requires, commands } of CHAINS) {
    await ifPresent(requires, () => dispatch.runChain(commands).then(() => undefined));
  }

  await ifPresent("cargo", () =>
    enqueueCargo(dispatch, {
      after: rustup === undefined ? undefined : [rustup],
      generateList: true,
    }),
  );
  await ifPresent("fish", () => enqueueFishCompletions(dispatch));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const dryRun = options.mode === "dry-run";
  const dispatch = createDispatcher(options);

  // OS packages first. Exactly one of paru and apt is expected to exist, so a
  // missing one is normal and not worth reporting.
  for (const { requires, steps } of OS_PACKAGES) {
    if (!commandExists(requires)) continue;
    for (const step of steps) await foregroundStep(step, dryRun);
  }

  // fish plugins, also in the foreground: pez writes to the fish config.
  await ifPresent("pez", () => foregroundStep(["pez", "upgrade"], dryRun));

  // Stale cargo-install leftovers, before new builds start. Only dirs left
  // alone for 30+ minutes, so builds in flight and other /tmp work are safe.
  await cleanCargoInstallLeftovers(dryRun);

  await enqueueAll(dispatch, dryRun);

  // The compose plugin needs sudo for the system-wide copy, which a detached
  // task cannot answer, so it runs here rather than being queued.
  await enqueueCompose(createDispatcher({ ...options, mode: dryRun ? "dry-run" : "direct" }));

  // Only the work PC has this.
  if (commandExists("deps_update")) await foregroundStep(["deps_update"], dryRun);

  await rebootCheck(dryRun);
}

async function cleanCargoInstallLeftovers(dryRun: boolean): Promise<void> {
  const argv = [
    "find",
    "/tmp",
    "-maxdepth",
    "1",
    "-name",
    "cargo-install*",
    "-type",
    "d",
    "-mmin",
    "+30",
    "-exec",
    "rm",
    "-rf",
    "{}",
    "+",
  ];
  if (dryRun) {
    note([`would run: ${argv.join(" ")}`]);
    return;
  }
  console.error("clean stale /tmp/cargo-install leftovers");
  // find exits non-zero for directories it cannot read; that is not a failure
  // worth reporting here, so the status is ignored the way `2>/dev/null` did.
  await Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" }).exited;
}

/** Offer a reboot when the system asked for one, except under WSL. */
async function rebootCheck(dryRun: boolean): Promise<void> {
  if (!(await Bun.file("/var/run/reboot-required").exists())) return;
  // WSL restarts differently, so the prompt is skipped there.
  if (await Bun.file("/proc/sys/fs/binfmt_misc/WSLInterop").exists()) return;

  console.error('"/var/run/reboot-required" exists. Reboot the system?(recommend)');
  if (dryRun) {
    note(["would run: re_boot"]);
    return;
  }
  await foreground("re_boot", ["re_boot"]);
}

if (import.meta.main) await main();
