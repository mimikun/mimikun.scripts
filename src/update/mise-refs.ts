#!/usr/bin/env bun
/**
 * Reinstall the mise tools pinned to a git ref, when that ref has moved.
 *
 * Replaces `update_mise`. That script had four subcommands; three of them
 * duplicated `mise upgrade`, which `vup.sh` already runs:
 *
 *   $ mise upgrade --dry-run
 *   Would uninstall vim@9.2.0894    Would install vim@9.2.0901
 *   Would uninstall zig@0.17.0-dev.1516+8a4b5424d
 *                                   Would install zig@0.17.0-dev.1525+91c6d8a09
 *
 * so `paleovim-latest`, `zig-master` and `zig-latest` are gone. What mise
 * cannot do is notice that a `ref:` pin now points at a different commit --
 * the version string stays `ref:master` however far upstream moves, so the
 * tool never shows up in `mise outdated`. That is the whole job left here.
 *
 * Usage: mise-refs.ts [name]... [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createDispatcher,
  type Dispatcher,
  type Handle,
  note,
  parseArgs,
  type RunOptions,
} from "../lib/runner.ts";
import { sq } from "../lib/shell.ts";

type RefTool = {
  /** Selector on the command line, kept from the shell version. */
  name: string;
  /** The mise tool spec to reinstall, e.g. `vim@ref:master`. */
  spec: string;
  /** Remembers the revision seen last time, so an unmoved ref costs nothing. */
  cache: string;
  /** The revision upstream is at now. */
  upstream: () => Promise<string>;
};

/** The head commit of `branch` in a remote repository. */
async function gitHead(repo: string, branch: string): Promise<string> {
  const proc = Bun.spawn(["git", "ls-remote", "--heads", repo, `refs/heads/${branch}`], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error(`git ls-remote failed for ${repo}`);
  }
  // "<sha>\trefs/heads/<branch>"
  const sha = stdout.split("\t")[0]?.trim();
  if (sha === undefined || sha === "") {
    throw new Error(`${repo} has no ${branch} branch`);
  }
  return sha;
}

const TOOLS: RefTool[] = [
  {
    name: "paleovim-master",
    spec: "vim@ref:master",
    cache: join(homedir(), ".cache", "paleovim-master-commit-hash.txt"),
    upstream: () => gitHead("https://github.com/vim/vim.git", "master"),
  },
];

/** The revision recorded on the last run, or null the first time. */
async function lastSeen(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const text = (await file.text()).trim();
  return text === "" ? null : text;
}

async function update(
  tool: RefTool,
  dispatch: Dispatcher,
  dryRun: boolean,
  after?: readonly Handle[],
): Promise<void> {
  const [seen, upstream] = await Promise.all([lastSeen(tool.cache), tool.upstream()]);

  if (seen === upstream) {
    note([`${tool.name} is already at ${upstream}`]);
    return;
  }
  note([`${tool.name} moved: ${seen ?? "(nothing recorded)"} -> ${upstream}`]);

  // A dry run must leave the cache alone, or the next real run would think
  // the ref had not moved and skip the rebuild. The shell version wrote it
  // unconditionally, but it had no dry run to get wrong.
  if (!dryRun) {
    await Bun.write(tool.cache, `${upstream}\n`);
  }

  // mise skips an install that is already there, so the old build has to go
  // first. The two are one unit and chain even when --serial is off.
  await dispatch.runChain(
    [`mise uninstall ${sq(tool.spec)}`, `mise install ${sq(tool.spec)}`],
    after,
  );
}

/**
 * Names and dispatcher flags can be interleaved. `--after` takes the argument
 * that follows it, so its value is not mistaken for a name.
 */
function splitArgs(argv: readonly string[]): { selected: string[]; flags: string[] } {
  const selected: string[] = [];
  const flags: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("-")) {
      selected.push(arg);
    } else if (arg === "--after") {
      flags.push(arg, argv[++i] ?? "");
    } else {
      flags.push(arg);
    }
  }
  return { selected, flags };
}

function selectTools(selected: readonly string[]): RefTool[] {
  const known = TOOLS.map((tool) => tool.name).join(", ");
  for (const name of selected) {
    if (!TOOLS.some((tool) => tool.name === name)) {
      throw new Error(`unknown tool: ${name} (have ${known})`);
    }
  }
  if (selected.length === 0) return TOOLS;
  return TOOLS.filter((tool) => selected.includes(tool.name));
}

/** Queue a rebuild for every `ref:` pinned tool whose commit has moved. */
export async function enqueue(
  dispatch: Dispatcher,
  options: { dryRun: boolean; after?: readonly Handle[]; selected?: readonly string[] },
): Promise<void> {
  for (const tool of selectTools(options.selected ?? [])) {
    await update(tool, dispatch, options.dryRun, options.after);
  }
}

async function main(): Promise<void> {
  const { selected, flags } = splitArgs(process.argv.slice(2));
  const options: RunOptions = parseArgs(flags);
  await enqueue(createDispatcher(options), { dryRun: options.mode === "dry-run", selected });
}

if (import.meta.main) await main();
