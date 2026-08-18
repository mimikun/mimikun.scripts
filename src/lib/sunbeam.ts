/**
 * The one place that parses `sunbeam extension list`.
 */

/**
 * Read `sunbeam extension list`:
 *
 *     github	https://raw.githubusercontent.com/pomdtr/sunbeam/main/extensions/github.ts
 *
 * The first column is the alias the extension was installed under, which is
 * what `sunbeam extension upgrade` takes. The origin URL is not used.
 */
export function parseExtensionList(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split("\n")) {
    const name = line.trim().split(/\s+/)[0];
    if (name === undefined || name === "") continue;
    names.push(name);
  }
  return names;
}

/** Every installed extension, by the alias `sunbeam extension upgrade` expects. */
export async function listExtensions(): Promise<string[]> {
  const proc = Bun.spawn(["sunbeam", "extension", "list"], { stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`sunbeam extension list failed (exit ${code})`);
  }
  return parseExtensionList(stdout);
}
