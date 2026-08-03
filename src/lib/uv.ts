/**
 * The one place that knows what a uv tool looks like, in either direction:
 * parsed out of `uv tool list`, and written to / read back from the package
 * list. `src/lib/cargo.ts` plays the same role for `cargo install-update`.
 *
 * Why the interpreter is part of the record: `uv tool upgrade` keeps whatever
 * Python a tool was built against, so updating never has to know. Reinstalling
 * from the list does -- `uv tool install <name>` builds against uv's *default*
 * interpreter, which is not the one the tool was originally given. On this
 * machine the default is a managed 3.10 while tools are spread across 3.10 to
 * 3.13, so a list of bare names would have quietly rebuilt all of them on the
 * wrong Python.
 */

export type UvTool = {
  name: string;
  /** `major.minor`, or undefined to let uv pick. */
  python?: string;
};

/**
 * Read `uv tool list --show-python`:
 *
 *     bagels v0.3.12 [CPython 3.13.14]
 *     - bagels
 *
 * Anchored on the `vN` version rather than on the leading word, so an
 * executable line whose name starts with a v is not taken for a package -- the
 * `grep "v[0-9]"` the shell original used got that wrong.
 *
 * The bracket is optional: `--show-python` is what puts it there, and a uv old
 * enough to lack the flag still parses, just without the pin.
 */
export function parseToolList(stdout: string): UvTool[] {
  const tools: UvTool[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^(\S+)\s+v\d\S*(?:\s+\[[^\]\d]*(\d+\.\d+)\.\S*\])?/.exec(line.trim());
    if (match === null) continue;
    const name = match[1] as string;
    const python = match[2];
    tools.push(python === undefined ? { name } : { name, python });
  }
  return tools;
}

/**
 * One package-list line: `name`, or `name 3.13` when the interpreter matters.
 *
 * Two columns rather than one file per Python version. A tool that moves from
 * 3.10 to 3.13 is then a one-character edit instead of a delete plus an add
 * across two files, and retiring a Python version -- 3.10 goes EOL in October
 * 2026 -- does not mean creating and deleting list files.
 *
 * Only `major.minor` is recorded. Pinning the patch would reinstall every tool
 * each time uv's managed Python picks up a patch release, and the patch is not
 * where Python breaks compatibility.
 */
export function formatToolLine(tool: UvTool): string {
  return tool.python === undefined ? tool.name : `${tool.name} ${tool.python}`;
}

/** The inverse of `formatToolLine`. A line with no second column pins nothing. */
export function parseToolLine(line: string): UvTool {
  const [name, python] = line.trim().split(/\s+/);
  return python === undefined ? { name: name as string } : { name: name as string, python };
}

export function installCommand(tool: UvTool): string {
  return tool.python === undefined
    ? `uv tool install ${tool.name}`
    : `uv tool install --python ${tool.python} ${tool.name}`;
}
