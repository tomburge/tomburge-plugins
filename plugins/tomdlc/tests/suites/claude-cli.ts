import { join } from "node:path"
import { H } from "../lib/harness.ts"
const hook = join(H, "block-claude-cli.ts")
import { extraBlock } from "./claude-cli-paths.ts"
const block = [...extraBlock,
  "claude", "claude -p 'do x'", "CLAUDE --version", "cd foo && claude -p hi", "ls | claude -p summarize",
  "& claude -p x", "FOO=1 claude", "sudo claude", "env -i PATH=/x claude", "timeout 30 claude -p x", "nohup claude -p x &",
  "xargs -I{} claude -p {}", "bash -c 'claude -p hi'", "sh -lc \"cd x; claude -p hi\"", "pwsh -Command \"claude -p hi\"",
  "cmd /c claude -p hi", "powershell -EncodedCommand YwBsAGEAdQBkAGUAIAAtAHAAIABoAGkA", "eval 'claude -p hi'", "iex 'claude -p hi'",
  "echo $(claude -p hi)", "echo \"$(claude -p hi)\"", "echo `claude -p hi`", "Start-Process claude -ArgumentList '-p','hi'",
  "npx @anthropic-ai/claude-code -p hi", "bunx @anthropic-ai/claude-code", "pnpm dlx @anthropic-ai/claude-code",
  "npm exec @anthropic-ai/claude-code", "node ./node_modules/@anthropic-ai/claude-code/cli.js -p hi", "(claude -p x)",
  // GitHub Copilot CLI
  "copilot", "copilot -p 'do x' --allow-all-tools", "gh copilot", "gh copilot -p hi", "& copilot -p x", "Start-Process copilot",
  "bash -c 'copilot -p hi'", "pwsh -Command \"copilot -p hi\"", "npx @github/copilot -p hi", "npm exec @github/copilot",
  String.raw`& "C:\Program Files\Microsoft VS Code\bin\copilot-shim\copilot.cmd" -p x`,
]
const allow = [
  "grep -rn claude .", "echo claude", "echo 'claude -p hi'", "git commit -m 'teach claude; fix claude | stuff'",
  "git commit -F - <<'EOF'\nfix\n\nclaude -p would run\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF",
  "cat ~/.claude/settings.json", "ls .claude-plugin", "claude-code-helper --x", "npm install -g @anthropic-ai/claude-code",
  "bun hooks-handlers/block-claude-cli.ts", "Get-Content $HOME\.claude\settings.json", "echo \"Claude says hi\"",
  "rg 'claude' --type ts", "git log --grep claude",
  "grep -rn copilot .", "echo copilot", "gh pr create --title 'copilot port'", "gh api repos/x/y", "npm install -g @github/copilot",
  "cat .github/copilot-instructions.md", "git commit -m 'copilot: fix hooks'",
]
let fail = 0
async function run(cmd: string) {
  const p = Bun.spawn([process.execPath, hook], { stdin: new TextEncoder().encode(JSON.stringify({ tool_input: { command: cmd } })), stdout: "pipe" })
  return (await new Response(p.stdout).text()).includes('"deny"')
}
for (const c of block) if (!(await run(c))) { fail++; console.log("MISSED  :", JSON.stringify(c)) }
for (const c of allow) if (await run(c)) { fail++; console.log("FALSE + :", JSON.stringify(c)) }
console.log(`${block.length} block cases, ${allow.length} allow cases, ${fail} failures`)

process.exitCode = fail > 0 ? 1 : 0
