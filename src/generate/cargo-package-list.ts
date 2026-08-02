#!/usr/bin/env bun
/**
 * Write the list of installed cargo packages to the package-list directory.
 *
 * Replaces `generate.sh`'s cargo pipeline, `mimikun.sh/src/generate/cargo-package-list.sh`,
 * and `powershell/Invoke-GenerateCargoPackageList.ps1`.
 */
import { listPackages } from "../lib/cargo.ts";
import { pkgListPath } from "../lib/platform.ts";

async function main(): Promise<void> {
  const packages = await listPackages();
  // `LC_ALL=C sort` in the original: byte order, not locale order.
  const names = packages.map((pkg) => pkg.name).sort();

  const destination = pkgListPath("cargo_packages.txt");
  await Bun.write(destination, names.map((name) => `${name}\n`).join(""));
  console.error(`wrote ${names.length} packages to ${destination}`);
}

await main();
