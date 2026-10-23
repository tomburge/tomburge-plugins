#!/usr/bin/env bun
// PreToolUse hook for Bash/PowerShell. Only the TomDLC orchestrator may start
// agents, and it does so with the Agent tool. This blocks every shell route to
// launching another agent CLI, whose session would run without these hooks:
// Claude Code (`claude`) or GitHub Copilot CLI (`copilot`, `gh copilot`),
// by path, wrapped (sudo, env, xargs, timeout, Start-Process, &), nested (bash
// -c, pwsh -Command/-EncodedCommand, eval, iex, $(...), backticks) or through a
// package runner (npx/bunx/pnpm dlx/npm exec @anthropic-ai/claude-code or
// @github/copilot, node cli.js). Mentions of the words as data (grep claude,
// commit messages, heredoc bodies) are allowed.
import { readEvent, respond } from "./lib/hook.ts"
import { commandName, simpleCommands } from "./lib/shell.ts"

const AGENT_CLIS = new Set(["claude", "copilot"])
const AGENT_PACKAGES = /@anthropic-ai\/claude-code|claude-code[\\/].*cli\.m?js|@github\/copilot\b/i
// Runners that execute their argument directly, and package managers that do
// so only through an exec subcommand (so `npm install <pkg>` stays allowed).
const RUNNERS = /^(npx|bunx|pnpx|node|bun|deno)$/
const PACKAGE_MANAGERS = /^(npm|pnpm|yarn)$/
const EXEC_SUBCOMMANDS = /^(exec|x|dlx)$/i

function launchesAgentCli(w: string[]): boolean {
  const name = commandName(w[0])
  if (AGENT_CLIS.has(name)) return true
  if (name === "gh" && (w[1] ?? "").toLowerCase() === "copilot") return true
  const runs = RUNNERS.test(name) || (PACKAGE_MANAGERS.test(name) && EXEC_SUBCOMMANDS.test(w[1] ?? ""))
  return runs && w.slice(1).some((a) => AGENT_PACKAGES.test(a) || AGENT_CLIS.has(commandName(a)))
}

const event = await readEvent()
const command = event.tool_input?.command

if (typeof command === "string" && simpleCommands(command).some(launchesAgentCli)) {
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "TomDLC: launching Claude Code or GitHub Copilot CLI from the shell is blocked. Only the orchestrator starts agents, and it uses the Agent tool. " +
        "If you are a stage agent, report the work under Handoffs in your result instead. " +
        "If the user wants to run claude or copilot themselves, tell them to run it in their own terminal.",
    },
  })
} else {
  respond()
}
