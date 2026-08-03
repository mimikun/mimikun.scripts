#!/usr/bin/env bun
/**
 * Update the docker compose CLI plugin.
 *
 * Replaces `update_docker_compose`.
 *
 * Docker Desktop ships compose itself and keeps every plugin in
 * `cli-plugins` as a symlink into its own tree, so on those machines this
 * download does nothing but replace a managed symlink with a hand-fetched
 * binary and then fight Docker Desktop over it at the next update. Machines
 * running Docker Engine have no such source and still need it, so the check
 * decides at run time rather than the script being dropped outright.
 *
 * Usage: docker-compose.ts [--no-pueue | --dry-run] [--serial] [--after <task-id>]...
 *
 * `vup.sh` runs this with `--no-pueue`: the system-wide destination needs
 * sudo, which cannot prompt from inside a pueue task.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { machineArch, osName } from "../lib/platform.ts";
import { createDispatcher, type Dispatcher, note, parseArgs } from "../lib/runner.ts";
import { sq } from "../lib/shell.ts";

/** Where the docker CLI looks for plugins, in the order it searches. */
const USER_PLUGIN = join(homedir(), ".docker", "cli-plugins", "docker-compose");
const SYSTEM_PLUGIN = "/usr/local/lib/docker/cli-plugins/docker-compose";

/**
 * Docker Desktop creates this directory for its own state. It is the one
 * marker that needs neither a running daemon nor WSL: `docker info` fails
 * when the daemon is down, and `/mnt/wsl/docker-desktop` only exists under
 * WSL. The plugin symlinks cannot be used as the signal either, since this
 * script's own past runs replaced them with real files.
 */
function dockerDesktopInstalled(): boolean {
  return existsSync(join(homedir(), ".docker", "desktop"));
}

/** The version of the plugin docker currently resolves, e.g. `v5.3.1`. */
async function installedVersion(): Promise<string | null> {
  const proc = Bun.spawn(["docker", "compose", "version", "--short"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return null;

  const version = stdout.trim();
  // `version --short` omits the leading v that the release tag carries.
  return version === "" ? null : `v${version}`;
}

async function latestVersion(): Promise<string> {
  const response = await fetch("https://api.github.com/repos/docker/compose/releases/latest");
  if (!response.ok) {
    throw new Error(`could not read the latest docker/compose release: HTTP ${response.status}`);
  }
  const { tag_name: version } = (await response.json()) as { tag_name?: string };
  if (typeof version !== "string" || version === "") {
    throw new Error("the latest docker/compose release has no tag name");
  }
  return version;
}

/**
 * The release asset for this machine, e.g. `docker-compose-linux-x86_64`.
 *
 * The shell version spelled this `docker-compose-$(uname -s)-$(uname -m)`,
 * which yields a capitalised `Linux`. That worked only because GitHub matches
 * asset names case-insensitively; the published name is lower case.
 */
function assetName(): string {
  return `docker-compose-${osName()}-${machineArch()}`;
}

/** Queue the download, unless Docker Desktop is already managing the plugin. */
export async function enqueue(dispatch: Dispatcher): Promise<void> {
  if (dockerDesktopInstalled()) {
    note([
      "Docker Desktop is installed, which ships and updates the compose plugin",
      "itself. Nothing to do.",
    ]);
    return;
  }

  const [installed, latest] = await Promise.all([installedVersion(), latestVersion()]);
  if (installed === latest) {
    note([`docker compose ${installed} is already the latest`]);
    return;
  }
  note([`docker compose ${installed ?? "(not installed)"} -> ${latest}`]);

  const url = `https://github.com/docker/compose/releases/download/${latest}/${assetName()}`;

  // One unit: the system copy is made from the file just downloaded, so the
  // steps chain even when --serial is off. The order is the shell version's.
  await dispatch.runChain([
    `curl -L ${url} -o ${sq(USER_PLUGIN)}`,
    `sudo cp ${sq(USER_PLUGIN)} ${sq(SYSTEM_PLUGIN)}`,
    `chmod 755 ${sq(USER_PLUGIN)}`,
    `sudo chmod 755 ${sq(SYSTEM_PLUGIN)}`,
  ]);
}

async function main(): Promise<void> {
  await enqueue(createDispatcher(parseArgs(process.argv.slice(2))));
}

if (import.meta.main) await main();
