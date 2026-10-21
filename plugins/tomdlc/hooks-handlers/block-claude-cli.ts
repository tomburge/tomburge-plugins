#!/usr/bin/env bun
// PreToolUse hook for Bash/PowerShell. Only the TomDLC orchestrator may start
// agents, and it does so with the Agent tool. This blocks every shell route to
// launching another Claude Code process: `claude`, claude.exe by path, wrapped
// (sudo, env, xargs, timeout, Start-Process, &), nested (bash -c, pwsh
// -Command/-EncodedCommand, eval, iex, $(...), backticks) or through a package
// runner (npx/bunx/pnpm dlx/npm exec @anthropic-ai/claude-code, node cli.js).
// Mentions of the word as data (grep claude, commit messages, heredoc bodies)
// are allowed.
import { readEvent, respond } from "./lib/hook.ts"
import { commandName, simpleCommands } from "./lib/shell.ts"

const CLAUDE_PACKAGE = /@anthropic-ai\/claude-code|claude-code[\\/].*cli\.m?js/i
// Runners that execute their argument directly, and package managers that do
// so only through an exec subcommand (so `npm install <pkg>` stays allowed).
const RUNNERS = /^(npx|bunx|pnpx|node|bun|deno)$/
const PACKAGE_MANAGERS = /^(npm|pnpm|yarn)$/
const EXEC_SUBCOMMANDS = /^(exec|x|dlx)$/i

function launchesClaude(w: string[]): boolean {
  const name = commandName(w[0])
  if (name === "claude") return true
  const runs = RUNNERS.test(name) || (PACKAGE_MANAGERS.test(name) && EXEC_SUBCOMMANDS.test(w[1] ?? ""))
  return runs && w.slice(1).some((a) => CLAUDE_PACKAGE.test(a) || commandName(a) === "claude")
}

const event = await readEvent()
const command = event.tool_input?.command

if (typeof command === "string" && simpleCommands(command).some(launchesClaude)) {
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "TomDLC: launching Claude Code from the shell is blocked. Only the orchestrator starts agents, and it uses the Agent tool. " +
        "If you are a stage agent, report the work under Handoffs in your result instead. " +
        "If the user wants to run claude themselves, tell them to run it in their own terminal.",
    },
  })
} else {
  respond()
}
