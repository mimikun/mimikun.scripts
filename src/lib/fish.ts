/**
 * Where fish looks for generated completions.
 *
 * This lives next to the fish config repo, which the completion updater
 * assumes is already checked out.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export function completionsDir(): string {
  return join(homedir(), ".config", "fish", "completions");
}

/** Path of one generated completion file, e.g. `rg` -> `<dir>/rg.fish`. */
export function completionFile(name: string): string {
  return join(completionsDir(), `${name}.fish`);
}
