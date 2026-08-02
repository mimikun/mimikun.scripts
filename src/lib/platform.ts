/**
 * Platform differences, isolated to one place.
 *
 * The bash and PowerShell originals each resolved the package-list directory
 * on their own (`$HOME/.mimikun-pkglists` vs `$env:USERPROFILE\.mimikun-pkglists`)
 * and each hard-coded its own OS prefix into the file name. Both differences
 * live here now so the callers stay platform-agnostic.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export type OsName = "linux" | "windows" | "darwin";

export function osName(): OsName {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    default:
      return "linux";
  }
}

export function pkgListDir(): string {
  return join(homedir(), ".mimikun-pkglists");
}

/**
 * Path to an OS-scoped package list, e.g. `cargo_packages.txt` resolves to
 * `~/.mimikun-pkglists/linux_cargo_packages.txt` on Linux and
 * `windows_cargo_packages.txt` on Windows.
 */
export function pkgListPath(name: string): string {
  return join(pkgListDir(), `${osName()}_${name}`);
}
