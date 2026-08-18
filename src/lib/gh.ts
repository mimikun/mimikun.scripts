/**
 * The one place that parses `gh extension list`.
 *
 * `src/lib/uv.ts` and `src/lib/cargo.ts` play the same role for their tools.
 */

/**
 * Read `gh extension list`:
 *
 *     gh dash	dlvhdr/gh-dash	v4.25.2
 *
 * The first column is the invocation (`gh <name>`), and `<name>` is what
 * `gh extension upgrade` takes. The repository and version columns are not
 * used: the upgrade asks GitHub for the current release itself.
 */
export function parseExtensionList(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^gh\s+(\S+)/.exec(line.trim());
    if (match === null) continue;
    names.push(match[1] as string);
  }
  return names;
}

/** Every installed extension, by the name `gh extension upgrade` expects. */
export async function listExtensions(): Promise<string[]> {
  const proc = Bun.spawn(["gh", "extension", "list"], { stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`gh extension list failed (exit ${code})`);
  }
  return parseExtensionList(stdout);
}
