/**
 * The single parser for `cargo install-update --list`.
 *
 * The originals each read the same output differently: generate used
 * `tail -n +4`, update used `grep "Yes" | cut -d " " -f 1`, and PowerShell used
 * `Select-Object -Skip 2` plus a regex. None of them handled the trailing notes
 * cargo-update prints after the table, e.g.
 *
 *   cship contains removed executables (cship), which will be re-installed [...]
 *
 * so `cut -f 1` turned that sentence into a package named "cship" and the
 * generated list contained it twice. Anchoring on the header row and stopping
 * at the blank line that closes the table fixes that.
 */

export type CargoPackage = {
  name: string;
  installed: string;
  latest: string;
  needsUpdate: boolean;
};

const HEADER = /^Package\s+Installed\s+Latest\s+Needs update\s*$/;

/**
 * A table row. The `Latest` column is not a bare version: cargo-update appends
 * a pre-release note to it, e.g.
 *
 *   clin-rs   v0.9.9   v0.9.9 (v0.10.0-rc.6 available)   No
 *
 * so `Latest` is matched lazily up to the trailing Yes/No rather than by
 * splitting on whitespace.
 */
const ROW = /^(\S+)\s+(\S+)\s+(.+?)\s+(Yes|No)$/;

/** Packages that cannot be built from crates.io on this setup. */
export const UNBUILDABLE: ReadonlySet<string> = new Set(["tabiew", "rustowl"]);

export function unbuildableNote(name: string): string[] {
  return [
    `compiling "${name}" takes a SO LONG time`,
    "can't install it from crates.io",
  ];
}

export function parseInstallUpdateList(output: string): CargoPackage[] {
  const lines = output.split("\n");
  const headerIndex = lines.findIndex((line) => HEADER.test(line));
  if (headerIndex === -1) {
    throw new Error("could not find the header row in `cargo install-update --list` output");
  }

  const packages: CargoPackage[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    // A blank line closes the table; anything after it is a trailing note.
    if (line.trim() === "") break;

    const match = ROW.exec(line.trim());
    if (match === null) {
      throw new Error(`unexpected row in \`cargo install-update --list\`: ${JSON.stringify(line)}`);
    }
    const [, name, installed, latest, needsUpdate] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    packages.push({ name, installed, latest, needsUpdate: needsUpdate === "Yes" });
  }
  return packages;
}

export async function listPackages(): Promise<CargoPackage[]> {
  const proc = Bun.spawn(["cargo", "install-update", "--list"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`cargo install-update --list failed (exit ${code})`);
  }
  return parseInstallUpdateList(stdout);
}
