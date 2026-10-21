#!/usr/bin/env bun
// Mechanical traceability check for a TomDLC project.
//
//   bun check-trace.ts <project-root> [--tests <dir> ...] [--json | --matrix]
//
// Reads docs/sdlc/*.md and the test files, then reports:
//  - undefined: IDs referenced somewhere but never defined in their home document
//  - duplicates: IDs defined more than once
//  - Must FRs the design doesn't mention, or that no delivery slice delivers
//  - Must FRs and SRs no test file or test report mentions
//  - threats (T-n) the test report doesn't mention
// Home documents: FR, NFR, SR, AC in 02-requirements.md; T in
// 03-threat-model.md; S, BR, ADR in 03-design.md (and 03-functional-design.md).
// With --matrix, prints an end-to-end traceability table instead (requirement →
// design → slices → tests → test report) for docs/sdlc/traceability.md.
// Prints a readable report (or JSON with --json). Always exits 0: it informs
// the gate; it doesn't decide it.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const args = process.argv.slice(2)
const root = args.find((a) => !a.startsWith("--")) ?? "."
const asJson = args.includes("--json")
const testDirs = args.flatMap((a, i) => (args[i - 1] === "--tests" ? [a] : []))

const SDLC = join(root, "docs", "sdlc")
// "AC-10.3" is acceptance criterion 3 of FR-10, not abuse case AC-10, so an ID followed by ".<digit>" is skipped.
const ID = /\b(FR|NFR|SR|AC|BR|ADR|T|S)-(\d+[a-z]?)\b(?!\.\d)/g
const HOME: Record<string, string[]> = {
  FR: ["02-requirements.md"], NFR: ["02-requirements.md"], SR: ["02-requirements.md"], AC: ["02-requirements.md"],
  T: ["03-threat-model.md"], S: ["03-design.md", "03-functional-design.md"], BR: ["03-design.md", "03-functional-design.md"],
  ADR: ["03-design.md", "03-functional-design.md"],
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "")
const docs = existsSync(SDLC) ? readdirSync(SDLC).filter((f) => f.endsWith(".md")) : []
const text = Object.fromEntries(docs.map((f) => [f, read(join(SDLC, f))]))

// ---- test files
const SKIP = /(^|[\\/])(node_modules|\.git|dist|build|vendor|\.venv|venv|__pycache__)([\\/]|$)/
const TEST_FILE = /(^|[\\/])(tests?|spec|__tests__)[\\/]|[._-](test|spec)\.[a-z]+$|^test_.*\.py$/i
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir) || SKIP.test(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (SKIP.test(p)) continue
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (st.size < 1_000_000 && /\.(py|js|jsx|ts|tsx|mjs|cjs|go|java|kt|rb|php|cs|rs|swift|scala|feature|robot)$/i.test(name)) out.push(p)
  }
  return out
}
const testFiles = (testDirs.length > 0 ? testDirs.flatMap((d) => walk(join(root, d))) : walk(root).filter((p) => TEST_FILE.test(relative(root, p))))
const testText = testFiles.map(read).join("\n")

// ---- definitions
const isHeading = (line: string, id: string) => new RegExp(`^\\s{0,3}#{1,6}\\s+(?:\\*\\*)?\`?${id}\\b`).test(line)
// A table row starting with the ID, or a field table naming it: "| ID | S-1 |" (the slice
// template) or a header row "| Field | S-1 |".
const FIELD_CELL = "\\|\\s*(?:\\*\\*)?(?:ID|Field)(?:\\*\\*)?\\s*"
const isTableRow = (line: string, id: string) => new RegExp(`^\\s*(?:${FIELD_CELL})?\\|\\s*(?:\\*\\*)?\`?${id}\\b`).test(line)
const isListItem = (line: string, id: string) => new RegExp(`^\\s*[-*]\\s+(?:\\*\\*)?\`?${id}\\b`).test(line)

interface Def { id: string; doc: string; line: number; must: boolean; heading: boolean }
const defs: Def[] = []
for (const [prefix, homes] of Object.entries(HOME)) {
  for (const doc of homes) {
    ;(text[doc] ?? "").split("\n").forEach((l, i) => {
      for (const m of l.matchAll(ID)) {
        if (m[1] !== prefix) continue
        const heading = isHeading(l, m[0])
        if (heading || isTableRow(l, m[0]) || isListItem(l, m[0])) defs.push({ id: m[0], doc, line: i + 1, must: /\bMust\b/.test(l), heading })
      }
    })
  }
}
// An ID in a definition table and again in a traceability table is normal, so only an ID
// with two or more headings counts as defined twice.
const defined = new Map<string, Def[]>()
for (const d of defs) defined.set(d.id, [...(defined.get(d.id) ?? []), d])

// ---- references
const refs = new Map<string, Set<string>>()
const addRefs = (where: string, body: string) => {
  for (const m of body.matchAll(ID)) refs.set(m[0], (refs.get(m[0]) ?? new Set()).add(where))
}
for (const [doc, body] of Object.entries(text)) addRefs(doc, body)
for (const f of testFiles) addRefs(relative(root, f).replaceAll("\\", "/"), read(f))

const homeExists = (prefix: string) => HOME[prefix].some((d) => d in text)
// "SR-14a" cites part (a) of SR-14: it's undefined only if SR-14 itself isn't defined either.
const basePart = (id: string) => id.replace(/(\d)[a-z]$/, "$1")
const undefinedIds = [...refs.keys()].filter((id) => homeExists(id.split("-")[0]) && !defined.has(id) && !defined.has(basePart(id))).sort()
const duplicates = [...defined.entries()]
  .map(([id, ds]) => [id, ds.filter((d) => d.heading)] as const)
  .filter(([, hs]) => hs.length > 1)
  .map(([id, hs]) => ({ id, at: hs.map((d) => `${d.doc}:${d.line}`) }))

const mustFRs = [...defined.values()].filter((ds) => ds[0].id.startsWith("FR-") && ds.some((d) => d.must)).map((ds) => ds[0].id)
const SRs = [...defined.keys()].filter((id) => id.startsWith("SR-"))
const threats = [...defined.keys()].filter((id) => id.startsWith("T-"))

const design = (text["03-design.md"] ?? "") + (text["03-functional-design.md"] ?? "")
const slicesSection = (() => {
  const m = (text["03-design.md"] ?? "").match(/^(#{1,6})\s+[^\n]*Delivery Slices[^\n]*\n([\s\S]*?)(?=^\1\s|(?![\s\S]))/m)
  return m ? m[2] : null
})()
// A mention of a part ("SR-14a") counts as a mention of the whole requirement ("SR-14").
const mentions = (body: string, id: string) => new RegExp(`\\b${id}${/\d$/.test(id) ? "[a-z]?" : ""}\\b(?!\\.\\d)`).test(body)
// Test evidence can be split across several 05-* documents (e.g. a separate security test report).
const report = Object.entries(text).filter(([f]) => f.startsWith("05-")).map(([, body]) => body).join("\n")
const verifyText = testText + "\n" + report

const result = {
  root,
  documents: docs,
  testFiles: testFiles.length,
  undefined: undefinedIds.map((id) => ({ id, referencedIn: [...(refs.get(id) ?? [])] })),
  duplicates,
  mustFRsNotInDesign: design ? mustFRs.filter((id) => !mentions(design, id)) : null,
  mustFRsNotInSlices: slicesSection !== null ? mustFRs.filter((id) => !mentions(slicesSection, id)) : null,
  notVerified: testFiles.length > 0 || report ? [...mustFRs, ...SRs].filter((id) => !mentions(verifyText, id)) : null,
  threatsNotInTestReport: report ? threats.filter((id) => !mentions(report, id)) : null,
  // FRs exist but none is marked Must: every Must check above would pass without checking anything.
  noMustFRs: [...defined.keys()].some((id) => id.startsWith("FR-")) && mustFRs.length === 0,
}

function traceMatrix(): string {
  const order = ["FR", "NFR", "SR"]
  const ids = [...defined.keys()]
    .filter((id) => order.includes(id.split("-")[0]))
    .sort((a, b) => order.indexOf(a.split("-")[0]) - order.indexOf(b.split("-")[0]) || Number.parseInt(a.split("-")[1]) - Number.parseInt(b.split("-")[1]) || a.localeCompare(b))
  // Split the Delivery Slices section into one block per slice: a heading, table row or list item
  // that starts with S-n (or an "| ID | S-n |" / "| Field | S-n |" row) opens a block. A slice delivers the IDs on its "Delivers" line when it has
  // one (other fields, like Done-when or Depends-on, mention IDs without delivering them), otherwise
  // the IDs anywhere in its block. Ranges such as FR-1..FR-14 or FR-1 to FR-14 are expanded.
  const blocks = new Map<string, string[]>()
  let current: string | null = null
  for (const line of (slicesSection ?? "").split("\n")) {
    const start = line.match(/^\s*(?:#{1,6}\s+|(?:\|\s*(?:\*\*)?(?:ID|Field)(?:\*\*)?\s*)?\|\s*|[-*]\s+)(?:\*\*)?`?(S-\d+[a-z]?)\b/)
    if (start) current = start[1]
    if (current) blocks.set(current, [...(blocks.get(current) ?? []), line])
  }
  const idsIn = (text: string) => {
    const found = new Set<string>()
    for (const m of text.matchAll(/\b(FR|NFR|SR)-(\d+)\s*(?:\.\.|–|—|-|to)\s*(?:\1-)?(\d+)\b/g))
      for (let n = Number(m[2]); n <= Number(m[3]) && n - Number(m[2]) < 200; n++) found.add(`${m[1]}-${n}`)
    for (const m of text.matchAll(ID)) if (order.includes(m[1])) found.add(m[0]).add(basePart(m[0]))
    return found
  }
  const sliceOf = new Map<string, Set<string>>()
  for (const [slice, lines] of blocks) {
    const delivers = lines.filter((l) => /^\s*(?:\|\s*)?(?:\*\*)?Delivers\b/i.test(l))
    for (const id of idsIn((delivers.length > 0 ? delivers : lines).join("\n")))
      sliceOf.set(id, (sliceOf.get(id) ?? new Set<string>()).add(slice))
  }
  const testsOf = (id: string) => testFiles.filter((f) => mentions(read(f), id)).map((f) => relative(root, f).replaceAll("\\", "/"))
  const cell = (xs: string[], max = 3) => (xs.length === 0 ? "—" : xs.slice(0, max).join(", ") + (xs.length > max ? ` +${xs.length - max}` : ""))
  const out = [
    "# Traceability",
    "",
    `<!-- Generated by check-trace.ts --matrix on ${new Date().toISOString().slice(0, 10)}; regenerate rather than editing by hand. -->`,
    "",
    "| ID | Must | Design | Slices | Tests | Test report |",
    "|---|---|---|---|---|---|",
    ...ids.map((id) => {
      const d = defined.get(id)!
      return `| ${id} | ${d.some((x) => x.must) ? "yes" : ""} | ${design ? (mentions(design, id) ? "yes" : "**missing**") : "—"} | ${cell([...(sliceOf.get(id) ?? [])])} | ${cell(testsOf(id))} | ${report ? (mentions(report, id) ? "yes" : "**missing**") : "—"} |`
    }),
  ]
  return out.join("\n")
}

// A saved matrix that no longer matches the documents misleads whoever reads it at the gate.
const TRACE = join(SDLC, "traceability.md")
const withoutDate = (s: string) => s.replace(/\r/g, "").split("\n").filter((l) => !l.startsWith("<!-- Generated by check-trace.ts")).join("\n").trim()
const matrixStale = existsSync(TRACE) && withoutDate(readFileSync(TRACE, "utf8")) !== withoutDate(traceMatrix())

if (args.includes("--matrix")) {
  console.log(traceMatrix())
} else if (asJson) {
  console.log(JSON.stringify({ ...result, matrixStale }, null, 2))
} else {
  const out: string[] = [`Traceability check: ${docs.length} documents, ${testFiles.length} test files, ${defs.length} definitions.`]
  const section = (title: string, items: string[] | null, skipped: string) => {
    if (items === null) out.push(`- ${title}: not checked (${skipped})`)
    else out.push(`- ${title}: ${items.length === 0 ? "none" : items.join(", ")}`)
  }
  section("Undefined IDs", result.undefined.map((u) => `${u.id} (in ${u.referencedIn.join(", ")})`), "")
  section("Defined more than once", result.duplicates.map((d) => `${d.id} (${d.at.join(", ")})`), "")
  section("Must FRs the design doesn't mention", result.mustFRsNotInDesign, "no design yet")
  section("Must FRs no slice delivers", result.mustFRsNotInSlices, "no Delivery Slices section")
  section("Must FRs and SRs no test or test report mentions", result.notVerified, "no tests or test report yet")
  section("Threats the test report doesn't mention", result.threatsNotInTestReport, "no test report yet")
  if (result.noMustFRs)
    out.push("- WARNING: no FR is marked Must, so the Must checks above checked nothing. Mark each FR's priority (Must, Should, Could) on its definition line in 02-requirements.md.")
  if (matrixStale)
    out.push("- WARNING: docs/sdlc/traceability.md is out of date. Regenerate it with --matrix before using it at the gate.")
  console.log(out.join("\n"))
}
