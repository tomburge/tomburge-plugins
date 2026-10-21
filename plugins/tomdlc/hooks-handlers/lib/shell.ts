// Shell command parsing shared by the Bash/PowerShell guard hooks. Not a full
// parser: it finds every simple command a line would run, including ones
// nested in subshells, substitutions, `bash -c`, `pwsh -Command`,
// `-EncodedCommand`, eval and iex, while treating quoted text and heredoc
// bodies as data.

const SHELLS = /^(bash|sh|zsh|dash|ksh|fish|pwsh|powershell|cmd)$/
const SHELL_FLAGS = /^(-c|-lc|-ic|-command|\/c|\/k)$/i
const ENCODED_FLAGS = /^-(e|ec|enc|encodedcommand)$/i
// Words that run their arguments as a command.
const WRAPPERS =
  /^(sudo|doas|env|nohup|time|exec|command|builtin|nice|ionice|setsid|stdbuf|unbuffer|timeout|watch|xargs|start|call|start-process|saps|&|\.)$/i
// Words that evaluate their arguments as a script.
const EVALUATORS = /^(eval|iex|invoke-expression)$/

/** Remove heredoc bodies: they are data fed to stdin, not commands. */
function stripHeredocs(cmd: string): string {
  return cmd.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, (m) => m.split("\n")[0])
}

/**
 * Split into simple commands on separators outside quotes, and collect the
 * contents of $(...) and backtick substitutions (which run even inside
 * double quotes) as extra commands.
 */
function segments(cmd: string): string[] {
  const out: string[] = []
  let cur = ""
  let quote: "'" | '"' | null = null
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (quote === "'") {
      if (c === "'") quote = null
      cur += c
      continue
    }
    if (c === "$" && cmd[i + 1] === "(") {
      let depth = 1
      let j = i + 2
      for (; j < cmd.length && depth > 0; j++) {
        if (cmd[j] === "(") depth++
        else if (cmd[j] === ")") depth--
      }
      out.push(...segments(cmd.slice(i + 2, j - 1)))
      cur += " "
      i = j - 1
      continue
    }
    if (c === "`") {
      const end = cmd.indexOf("`", i + 1)
      if (end > i) {
        out.push(...segments(cmd.slice(i + 1, end)))
        i = end
        continue
      }
    }
    if (quote === '"') {
      if (c === '"') quote = null
      cur += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      cur += c
    } else if (";|\n(){}".includes(c) || (c === "&" && !/^\s*$/.test(cur))) {
      // A leading "&" is PowerShell's call operator, so keep it as a word.
      out.push(cur)
      cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Split a simple command into words, removing quotes. */
function words(segment: string): string[] {
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  for (let m; (m = re.exec(segment)); ) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

/** Skip leading VAR=value assignments, wrappers and their options. */
function stripWrappers(w: string[]): string[] {
  let i = 0
  while (i < w.length) {
    const head = w[i]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head) || WRAPPERS.test(head) || /^-/.test(head) || /^\d+[smhd]?$/.test(head)) i++
    else break
  }
  return w.slice(i)
}

/** Lowercase executable name without directory or Windows extension. */
export function commandName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? word).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "")
}

/** Every simple command (as words, wrappers removed) the line would run. */
export function simpleCommands(cmd: string, depth = 0): string[][] {
  if (depth > 5) return []
  const out: string[][] = []
  for (const segment of segments(stripHeredocs(cmd))) {
    const w = stripWrappers(words(segment))
    if (w.length === 0) continue
    out.push(w)
    const name = commandName(w[0])
    if (EVALUATORS.test(name)) out.push(...simpleCommands(w.slice(1).join(" "), depth + 1))
    if (SHELLS.test(name)) {
      const i = w.findIndex((a) => SHELL_FLAGS.test(a) || ENCODED_FLAGS.test(a))
      if (i >= 0 && i + 1 < w.length) {
        const script = ENCODED_FLAGS.test(w[i])
          ? Buffer.from(w[i + 1], "base64").toString("utf16le")
          : w.slice(i + 1).join(" ")
        out.push(...simpleCommands(script, depth + 1))
      }
    }
  }
  return out
}

const REDIRECT = /^(?:\d|&)?>>?\|?$/
const REDIRECT_INLINE = /^(?:\d|&)?>>?\|?([^&].*)$/
const PS_PATH_FLAGS = ["-path", "-filepath", "-literalpath"]

/**
 * Files a simple command would write, as written in the command: output
 * redirections, tee, sed -i, cp/mv destinations and the PowerShell content
 * and item cmdlets. Targets that use variables can't be resolved and are left
 * out, as are null devices.
 */
export function writeTargets(w: string[]): string[] {
  const out: string[] = []
  w.forEach((word, i) => {
    if (REDIRECT.test(word) && w[i + 1] !== undefined) out.push(w[i + 1])
    else {
      const m = word.match(REDIRECT_INLINE)
      if (m) out.push(m[1])
    }
  })
  const name = commandName(w[0])
  const args = w.slice(1).filter((a, i, all) => !REDIRECT.test(a) && !REDIRECT.test(all[i - 1] ?? "") && !REDIRECT_INLINE.test(a))
  const pos = positionals(args)
  const flagValue = (flags: string[]) => {
    const i = args.findIndex((a) => flags.includes(a.toLowerCase()))
    return i >= 0 ? args[i + 1] : undefined
  }

  if (name === "tee") out.push(...pos)
  else if (name === "sed" && args.some((a) => /^(-i|--in-place)/.test(a))) out.push(...(args.some((a) => a === "-e" || a === "-f") ? pos : pos.slice(1)))
  else if ((name === "cp" || name === "mv") && pos.length >= 2) out.push(pos[pos.length - 1])
  else if (["set-content", "add-content", "out-file", "new-item", "clear-content"].includes(name)) {
    const target = flagValue(PS_PATH_FLAGS) ?? pos[0]
    if (target) out.push(target)
  } else if (["copy-item", "move-item"].includes(name)) {
    const target = flagValue(["-destination"]) ?? pos[1]
    if (target) out.push(target)
  }
  return out.filter((t) => t && !/[$%]/.test(t) && !/^(\/dev\/null|nul|\$null)$/i.test(t))
}

/** Arguments that aren't flags, skipping the values of the given flags. */
export function positionals(args: string[], valueFlags: string[] = []): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith("-")) {
      if (!a.includes("=") && valueFlags.includes(a)) i++
      continue
    }
    out.push(a)
  }
  return out
}
