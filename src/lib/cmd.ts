/**
 * Command and environment probing.
 *
 * Replaces three separate implementations of the same check: `existsCmd` in
 * install.sh, `command_exist` in update-fish-completions.sh, and
 * `Invoke-ExistsCmd` in the PowerShell scripts.
 */

/** Whether `name` resolves to an executable on PATH. */
export function commandExists(name: string): boolean {
  return Bun.which(name) !== null;
}

/** Whether an environment variable is set and non-empty. */
export function envVarSet(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== "";
}
