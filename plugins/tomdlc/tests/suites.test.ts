// Runs every suite in tests/suites as its own process (each drives the hook
// handlers and scripts the way Claude Code does, through stdin and stdout).
// A suite passes when it exits 0; failures print the suite's output.
//
//   bun test                  # all suites
//   bun test --test-name-pattern approval
import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { join } from "node:path"

const SUITES = join(import.meta.dir, "suites")

for (const file of readdirSync(SUITES).filter((f) => f.endsWith(".ts") && !f.endsWith("-paths.ts"))) {
  test(
    file.replace(/\.ts$/, ""),
    async () => {
      const proc = Bun.spawn([process.execPath, join(SUITES, file)], { stdout: "pipe", stderr: "pipe" })
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
      if (code !== 0) console.log(`--- ${file} ---\n${out}${err}`)
      expect(code).toBe(0)
    },
    600_000,
  )
}
