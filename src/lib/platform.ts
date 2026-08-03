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

/**
 * What `uname -m` prints, e.g. `x86_64`. The shell originals built release
 * asset names out of `$(uname -s)-$(uname -m)`; resolving it here means the
 * generated command carries a literal name instead of a substitution, so
 * `--dry-run` shows the URL that will actually be fetched.
 */
export function machineArch(): string {
  switch (process.arch) {
    case "x64":
      return "x86_64";
    case "arm64":
      return "aarch64";
    default:
      throw new Error(`no uname -m mapping for ${process.arch}`);
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

/**
 * Path to a package list that is the same on every OS, so it carries no
 * prefix. Only the gh extension list is like this: extensions are named
 * `owner/repo` and install identically everywhere.
 */
export function sharedPkgListPath(name: string): string {
  return join(pkgListDir(), name);
}
