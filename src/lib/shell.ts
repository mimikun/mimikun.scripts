/**
 * Quoting for the commands handed to pueue.
 *
 * Generated commands are strings that pueue runs through a shell, so any path
 * built from `$HOME` or a package name has to survive that pass. The shell
 * originals quoted these by hand and were inconsistent about it; doing it in
 * one place keeps `--dry-run` output comparable between scripts.
 */

/** Single-quote a value for the shell that pueue runs the command through. */
export function sq(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
