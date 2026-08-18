/**
 * The one place that parses `gup list`.
 */

/**
 * Read `gup list`:
 *
 *     actionlint: github.com/rhysd/actionlint/cmd/actionlint@v1.7.12
 *
 * The name is right-aligned with spaces, so the line is trimmed before the
 * colon is split off. Only the binary name is kept: `gup update <name>` looks
 * the import path back up in the binary itself.
 */
export function parseList(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^(\S+):\s+\S+/.exec(line.trim());
    if (match === null) continue;
    names.push(match[1] as string);
  }
  return names;
}

/**
 * Every binary `gup` manages, by the name `gup update` expects.
 *
 * stderr is dropped rather than inherited: gup writes the same listing to both
 * streams, so inheriting it would print all 296 lines to the terminal on top of
 * what is parsed here.
 */
export async function listBinaries(): Promise<string[]> {
  const proc = Bun.spawn(["gup", "list"], { stdout: "pipe", stderr: "ignore" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`gup list failed (exit ${code})`);
  }
  return parseList(stdout);
}
