#!/usr/bin/env bun
// Moves a project's TomDLC files from docs/sdlc/ (where older versions kept
// them, mixed in with the project's own documentation) to .tomdlc/.
//
//   bun move-to-tomdlc.ts [project-dir]
//
// A plain folder move isn't enough: the audit snapshot records archived log
// segments and the fingerprints of approved documents by their project-relative
// paths, and state.json's stage `outputs` may list files in docs/sdlc. This
// rewrites those paths (in state.json and in the state the hooks recorded, so the
// two still match), regenerates the register views, updates .gitignore entries,
// and logs the move in the audit log. Approved documents and the user's recorded
// words are not edited, so links inside documents still say docs/sdlc.
import { existsSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { appendAudit, readSnapshot, updateSnapshot, verifyAudit } from "../hooks-handlers/lib/audit.ts"
import { STATE_FILE } from "../hooks-handlers/lib/hook.ts"
import { syncRegisters } from "../hooks-handlers/lib/registers.ts"

type Obj = Record<string, any>
const OLD = "docs/sdlc"
const NEW = ".tomdlc"
const root = resolve(process.argv[2] ?? process.cwd())
const fix = (p: unknown) => (typeof p === "string" ? p.replaceAll("\\", "/").replace(/^docs\/sdlc\//i, `${NEW}/`) : p)

/** Rewrites `outputs` paths in the active stages and in archived changes. */
function fixOutputs(state: Obj): Obj {
  const fixStages = (stages: Obj | undefined) => {
    for (const st of Object.values(stages ?? {})) if (st && Array.isArray(st.outputs)) st.outputs = st.outputs.map(fix)
  }
  fixStages(state.stages)
  for (const c of Array.isArray(state.completedChanges) ? state.completedChanges : []) fixStages(c?.stages)
  return state
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!existsSync(join(root, OLD))) fail(`Nothing to move: ${join(root, OLD)} doesn't exist.`)
if (existsSync(join(root, NEW))) fail(`${join(root, NEW)} already exists. Merge the two folders by hand, then re-run TomDLC.`)

renameSync(join(root, OLD), join(root, NEW))
if (readdirSync(join(root, "docs")).length === 0) rmdirSync(join(root, "docs"))

const snap = readSnapshot(root)
if (snap) {
  const fps = snap.fingerprints ?? {}
  const moveKeys = (prints: Obj | undefined) =>
    Object.fromEntries(Object.entries(prints ?? {}).map(([stage, fp]: [string, any]) => [stage, { ...fp, files: Object.fromEntries(Object.entries(fp.files ?? {}).map(([f, h]) => [fix(f), h])) }]))
  updateSnapshot(root, {
    segments: (snap.segments ?? []).map((s) => ({ ...s, file: fix(s.file) as string })),
    fingerprints: { gates: moveKeys(fps.gates), reviews: moveKeys(fps.reviews) },
    ...(snap.state && typeof snap.state === "object" ? { state: fixOutputs(snap.state as Obj) } : {}),
  })
}

let state: Obj | null = null
if (existsSync(join(root, STATE_FILE))) {
  const text = readFileSync(join(root, STATE_FILE), "utf8")
  state = fixOutputs(JSON.parse(text))
  writeFileSync(join(root, STATE_FILE), JSON.stringify(state, null, 2) + (text.endsWith("\n") ? "\n" : ""))
  syncRegisters(root, state)
}

const gitignore = join(root, ".gitignore")
if (existsSync(gitignore)) {
  const text = readFileSync(gitignore, "utf8")
  const next = text.replace(/^(\/?)docs\/sdlc\//gim, `$1${NEW}/`)
  if (next !== text) writeFileSync(gitignore, next)
}

appendAudit(root, "tomdlc_folder_moved", "user", { from: OLD, to: NEW })
const check = verifyAudit(root)
console.log(
  `Moved ${OLD}/ to ${NEW}/ in ${root}.` +
    (check.problem ? ` WARNING: the audit log failed its integrity check after the move: ${check.problem}` : ` Audit log: ${check.entries} entries, chain intact.`) +
    " Links inside the documents still say docs/sdlc; they weren't edited, so approved documents keep their fingerprints.",
)
