#!/usr/bin/env bun
// Runs a PreToolUse guard so that it fails closed. Claude Code treats a hook that
// crashes or times out as a non-blocking error and lets the tool call through, so a
// guard with a syntax error, an unexpected exception or a hang would silently stop
// guarding. This wrapper runs the guard (given as the first argument, relative to
// this folder) as a child process with a deadline, and denies the call if the guard
// fails to load, throws, exits non-zero, prints something that isn't JSON, or
// doesn't answer in time. A child process, unlike an in-process timer, also catches
// a guard stuck in a synchronous loop.
//
//   bun fail-closed.ts approval-guard.ts   (stdin is passed through to the guard)
//
// TOMDLC_GUARD_TIMEOUT_MS overrides the deadline (default 20 s, below Claude Code's
// own hook timeout, so the wrapper decides before Claude Code gives up).
import { join } from "node:path"
import { respond } from "./lib/hook.ts"

const guard = process.argv[2] ?? ""
const deadline = Number(process.env.TOMDLC_GUARD_TIMEOUT_MS ?? 20_000)

function deny(why: string): void {
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `TomDLC: the ${guard || "(unnamed)"} hook failed (${why}), so this call was blocked to be safe. ` +
        "Tell the user: a TomDLC guard is broken and needs fixing before work continues.",
    },
  })
}

if (!/^[\w-]+\.ts$/.test(guard)) {
  deny(`not a guard file name: "${guard}"`)
} else {
  const input = await new Response(Bun.stdin.stream()).arrayBuffer()
  const child = Bun.spawn([process.execPath, join(import.meta.dir, guard)], {
    stdin: new Uint8Array(input), stdout: "pipe", stderr: "pipe", env: process.env,
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, deadline)
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  clearTimeout(timer)
  if (timedOut) {
    deny(`no answer within ${Math.round(deadline / 1000)} s`)
  } else if (code !== 0) {
    const first = err.split("\n").map((l) => l.trim()).find((l) => /error/i.test(l)) ?? err.trim().split("\n")[0] ?? ""
    deny(`exit code ${code}${first ? `: ${first.slice(0, 200)}` : ""}`)
  } else {
    try {
      JSON.parse(out || "{}")
      process.stdout.write(out)
    } catch {
      deny("its output wasn't valid JSON")
    }
  }
}
