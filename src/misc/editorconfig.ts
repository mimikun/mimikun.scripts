#!/usr/bin/env bun
/**
 * Drop `.editorconfig` into the current directory, copied from the template.
 *
 * Replaces `mimikun.sh/src/misc/editorconfig.sh` and the PowerShell
 * `Invoke-GenerateEditorConfig`, which were the same five lines written twice
 * -- once with `cp` and `$HOME`, once with `Copy-Item` and `$env:USERPROFILE`.
 * That difference is all `homedir()` here.
 *
 * Usage: editorconfig.ts [--dry-run]
 *
 * Nothing is queued, so `--dry-run` only reports what would be written. It is
 * here because every script in this repo takes it.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const TEMPLATE = join(homedir(), ".editorconfig-template");
const TARGET = ".editorconfig";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  // Already there: say nothing and change nothing, as the originals did.
  if (await Bun.file(TARGET).exists()) return;

  const template = Bun.file(TEMPLATE);
  if (!(await template.exists())) {
    // The shell versions let `cp` fail here, which said "No such file or
    // directory" without naming which file was expected.
    console.error(`${TEMPLATE}: not found, so there is nothing to copy`);
    process.exit(1);
  }

  console.error(`${TARGET} not exist.`);
  console.error(`Creating ${TARGET}.`);
  if (dryRun) {
    console.error(`would copy ${TEMPLATE} -> ${TARGET}`);
    return;
  }
  await Bun.write(TARGET, template);
}

if (import.meta.main) await main();
