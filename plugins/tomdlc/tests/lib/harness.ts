// Shared setup for the TomDLC test suites. Importing it creates a fresh
// temporary workspace (SP) with the fixtures the suites expect, and removes
// it when the suite exits (set TOMDLC_KEEP_TEST_DIR=1 to keep it for
// debugging). Works on Windows, macOS and Linux.
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..", "..")
const FIXTURES = join(ROOT, "tests", "fixtures")

/** The plugin's hook handlers and scripts. */
export const H = join(ROOT, "hooks-handlers")
export const SCRIPTS = join(ROOT, "scripts")

/** This suite's scratch workspace. */
export const SP = mkdtempSync(join(tmpdir(), "tomdlc-test-"))

// proj2: a small project several suites share.
mkdirSync(join(SP, "proj2", "docs", "sdlc"), { recursive: true })
mkdirSync(join(SP, "proj2", "src"), { recursive: true })
writeFileSync(join(SP, "proj2", "src", "app.py"), "x = 1\n")
writeFileSync(join(SP, "proj2", "README.md"), "# notes\n")

// Sample scanner reports for import-findings.
cpSync(join(FIXTURES, "scans"), join(SP, "scans"), { recursive: true })

// Fake semgrep and gitleaks on a private PATH, for the per-file scan hook.
export const FAKEBIN = join(SP, "fakebin")
cpSync(join(FIXTURES, "fakebin"), FAKEBIN, { recursive: true })
for (const tool of ["semgrep", "gitleaks"]) {
  if (process.platform === "win32") {
    writeFileSync(join(FAKEBIN, `${tool}.cmd`), `@"${process.execPath}" "%~dp0fake-${tool}.ts" %*\r\n`)
  } else {
    const shim = join(FAKEBIN, tool)
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-${tool}.ts" "$@"\n`)
    chmodSync(shim, 0o755)
  }
}

/** A PATH with no scanners on it. */
export const EMPTY_BIN = join(SP, "empty-bin")
mkdirSync(EMPTY_BIN)

/** PATH with `dir` in front of the current one. */
export const pathWith = (dir: string) => `${dir}${delimiter}${process.env.PATH ?? ""}`

process.on("exit", () => {
  if (process.env.TOMDLC_KEEP_TEST_DIR) console.log(`(test workspace kept at ${SP})`)
  else rmSync(SP, { recursive: true, force: true })
})
