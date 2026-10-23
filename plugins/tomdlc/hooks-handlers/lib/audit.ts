// Append-only, hash-chained audit log for TomDLC projects.
// Each line of .tomdlc/audit.jsonl records the SHA-256 of the line before it
// in `prev`, so editing or deleting any line breaks the chain. The snapshot
// file remembers the entry count and last hash, which also catches the tail
// being truncated. Only hooks write these files; the ownership guard blocks
// the file tools and visible shell writes to them for everyone.
//
// The snapshot also holds fingerprints (SHA-256) of each stage's documents,
// taken when the stage's gate is approved and when the reviewer returns READY,
// so later changes to approved or reviewed documents can be detected.
//
// Rotation: once the live log reaches TOMDLC_AUDIT_ROTATE_LINES entries (default
// 20,000), it moves to .tomdlc/audit-archive/audit-NNNN.jsonl and a new live log
// starts with a log_rotated entry chained to the archive's last line, so the chain
// runs unbroken across segments. The snapshot records each segment's entry count,
// last hash and file hash, so an edited or deleted archive is detected. Reading and
// verifying span every segment, so guards that look back through the log still
// see the events that were archived.
import { createHash } from "node:crypto"
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AUDIT_ARCHIVE_DIR, AUDIT_FILE, AUDIT_LOCK, AUDIT_SNAPSHOT } from "./hook.ts"

const GENESIS = "0".repeat(64)
export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex")

export interface Fingerprint {
  at: string
  files: Record<string, string> // relative path → sha256, or "missing"
}

/** An archived segment of the log: its file (relative to the project), entries, last line's hash and file hash. */
export interface Segment {
  file: string
  entries: number
  lastHash: string
  sha256: string
}

export interface Snapshot {
  count: number // entries in the live log
  lastHash: string
  segments?: Segment[]
  state?: unknown
  fingerprints?: {
    gates?: Record<string, Fingerprint>
    reviews?: Record<string, Fingerprint>
  }
}

export interface AuditEntry {
  ts: string
  event: string
  actor: string
  [key: string]: unknown
}

export const isTomdlcProject = (root: string) => existsSync(join(root, ".tomdlc"))

const fileLines = (path: string): string[] => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [])

/** Lines of the live log only. */
function lines(root: string): string[] {
  return fileLines(join(root, AUDIT_FILE))
}

/** Lines of every archived segment, then the live log: the whole history, oldest first. */
function allLines(root: string): string[] {
  const segments = readSnapshot(root)?.segments ?? []
  return [...segments.flatMap((s) => fileLines(join(root, s.file))), ...lines(root)]
}

const rotateAt = () => Math.max(2, Number(process.env.TOMDLC_AUDIT_ROTATE_LINES ?? 20_000))

/** Every parseable entry in the log (all segments), oldest first. */
export function readAudit(root: string): AuditEntry[] {
  return allLines(root).flatMap((l) => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
}

export function readSnapshot(root: string): Snapshot | null {
  try {
    const path = join(root, AUDIT_SNAPSHOT)
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
  } catch {
    return null
  }
}

// Hooks run as separate processes, often at the same moment (parallel agents,
// several hooks per event). Every read-modify-write of the log or snapshot
// happens under an exclusive lock file, or two writers can chain to the same
// previous line and break the chain. Found in the live run.
let lockDepth = 0
const LOCK_BUSY = ["EEXIST", "EPERM", "EACCES", "EBUSY"]

function locked<T>(root: string, fn: () => T): T {
  if (lockDepth > 0) return fn() // already held by this process
  const lock = join(root, AUDIT_LOCK)
  const deadline = Date.now() + 5000
  let acquired = false
  while (!acquired) {
    try {
      closeSync(openSync(lock, "wx"))
      acquired = true
    } catch (err: any) {
      // On Windows, creating the lock while its last holder is still deleting it
      // fails with EPERM (or EACCES/EBUSY), not EEXIST: that's contention too.
      if (!LOCK_BUSY.includes(err?.code)) break
      try {
        // A lock left by a crashed hook is stale after 10 seconds.
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { force: true })
      } catch {
        // It vanished between checks; retry.
      }
      if (Date.now() > deadline) break // Write anyway rather than lose the event; verifyAudit will show any damage.
      Bun.sleepSync(2 + Math.floor(Math.random() * 15))
    }
  }
  lockDepth++
  try {
    return fn()
  } finally {
    lockDepth--
    if (acquired) rmSync(lock, { force: true })
  }
}

/** Merge fields into the snapshot, keeping the ones not given. */
export function updateSnapshot(root: string, patch: Partial<Snapshot>): void {
  locked(root, () => {
    const snap = readSnapshot(root) ?? { count: 0, lastHash: GENESIS }
    writeFileSync(join(root, AUDIT_SNAPSHOT), JSON.stringify({ ...snap, ...patch }, null, 2) + "\n")
  })
}

/** Append one event; `state` (if given) becomes the snapshot's last-seen state.json. */
export function appendAudit(root: string, event: string, actor: string, data: Record<string, unknown> = {}, state?: unknown): void {
  locked(root, () => {
    let existing = lines(root)
    if (existing.length >= rotateAt()) {
      rotate(root, existing)
      existing = lines(root)
    }
    const segments = readSnapshot(root)?.segments ?? []
    const prev = existing.length > 0 ? sha256(existing[existing.length - 1]) : segments.at(-1)?.lastHash ?? GENESIS
    const line = JSON.stringify({ ts: new Date().toISOString(), event, actor, ...data, prev })
    appendFileSync(join(root, AUDIT_FILE), line + "\n")
    updateSnapshot(root, { count: existing.length + 1, lastHash: sha256(line), ...(state !== undefined ? { state } : {}) })
  })
}

/** Move the live log into the archive and start a new one with a log_rotated entry (call under the lock). */
function rotate(root: string, existing: string[]): void {
  const segments = readSnapshot(root)?.segments ?? []
  mkdirSync(join(root, AUDIT_ARCHIVE_DIR), { recursive: true })
  const file = `${AUDIT_ARCHIVE_DIR}/audit-${String(segments.length + 1).padStart(4, "0")}.jsonl`
  renameSync(join(root, AUDIT_FILE), join(root, file))
  const segment: Segment = { file, entries: existing.length, lastHash: sha256(existing[existing.length - 1]), sha256: sha256(readFileSync(join(root, file))) }
  const first = JSON.stringify({
    ts: new Date().toISOString(), event: "log_rotated", actor: "hook",
    archived: file, entries: segment.entries, sha256: segment.sha256, prev: segment.lastHash,
  })
  writeFileSync(join(root, AUDIT_FILE), first + "\n")
  updateSnapshot(root, { segments: [...segments, segment], count: 1, lastHash: sha256(first) })
}

/** Remember the last-seen state.json without logging an event. */
export function rememberState(root: string, state: unknown): void {
  updateSnapshot(root, { state })
}

/** Check the chain and the snapshot. Returns null when intact, else a description of the problem. */
export function verifyAudit(root: string): { entries: number; problem: string | null } {
  const snap = readSnapshot(root)
  const segments = snap?.segments ?? []
  for (const s of segments) {
    const path = join(root, s.file)
    if (!existsSync(path)) return { entries: 0, problem: `archived segment ${s.file} is missing` }
    if (sha256(readFileSync(path)) !== s.sha256) return { entries: 0, problem: `archived segment ${s.file} was changed after it was archived` }
  }
  const all = allLines(root)
  const archived = segments.reduce((n, s) => n + s.entries, 0)
  let prev = GENESIS
  for (let i = 0; i < all.length; i++) {
    let entry: { prev?: string }
    try {
      entry = JSON.parse(all[i])
    } catch {
      return { entries: all.length, problem: `line ${i + 1} is not valid JSON` }
    }
    if (entry.prev !== prev) return { entries: all.length, problem: `line ${i + 1} doesn't chain to the line before it (edited, inserted or deleted)` }
    prev = sha256(all[i])
  }
  if (snap && snap.count > 0) {
    const live = all.length - archived
    if (live < snap.count) return { entries: all.length, problem: `the log has ${live} live entries but ${snap.count} were written (truncated)` }
    if (sha256(all[archived + snap.count - 1]) !== snap.lastHash) return { entries: all.length, problem: `entry ${archived + snap.count} doesn't match the snapshot` }
  }
  return { entries: all.length, problem: null }
}

// ---- Fingerprints of approved and reviewed documents

/** Documents each stage's approval covers. Living documents (practices, decisions, operations) are left out. */
const STAGE_DOCS: Record<string, string[]> = {
  plan: [".tomdlc/01-plan.md"],
  requirements: [".tomdlc/02-requirements.md"],
  design: [".tomdlc/03-design.md", ".tomdlc/03-ux.md", ".tomdlc/03-threat-model.md", ".tomdlc/03-platform.md"],
  develop: [".tomdlc/04-develop.md"],
  test: [".tomdlc/05-test-report.md"],
  deploy: [".tomdlc/06-release.md", ".tomdlc/06-infra.md"],
}

/** The stage's default documents plus any extra paths listed in `stages.<stage>.outputs`. */
export function stageDocs(state: any, stage: string): string[] {
  const extra: unknown = state?.stages?.[stage]?.outputs
  const listed = Array.isArray(extra) ? extra.filter((p): p is string => typeof p === "string") : []
  return [...new Set([...(STAGE_DOCS[stage] ?? []), ...listed.map((p) => p.replaceAll("\\", "/"))])]
}

export function fingerprint(root: string, paths: string[]): Fingerprint {
  const files: Record<string, string> = {}
  for (const p of paths) {
    const abs = join(root, p)
    files[p] = existsSync(abs) ? sha256(readFileSync(abs)) : "missing"
  }
  return { at: new Date().toISOString(), files }
}

export interface Drift {
  kind: "gate" | "review"
  stage: string
  file: string
  since: string
}

/** Documents whose current content differs from what was approved or reviewed. */
export function drift(root: string, snap: Snapshot | null = readSnapshot(root)): Drift[] {
  const out: Drift[] = []
  for (const kind of ["gate", "review"] as const) {
    const prints = (kind === "gate" ? snap?.fingerprints?.gates : snap?.fingerprints?.reviews) ?? {}
    for (const [stage, fp] of Object.entries(prints)) {
      const now = fingerprint(root, Object.keys(fp.files)).files
      for (const [file, hash] of Object.entries(fp.files)) if (now[file] !== hash) out.push({ kind, stage, file, since: fp.at })
    }
  }
  return out
}

export function setFingerprint(root: string, kind: "gates" | "reviews", stage: string, fp: Fingerprint): void {
  locked(root, () => {
    const snap = readSnapshot(root)
    const fps = { gates: { ...(snap?.fingerprints?.gates ?? {}) }, reviews: { ...(snap?.fingerprints?.reviews ?? {}) } }
    fps[kind][stage] = fp
    updateSnapshot(root, { fingerprints: fps })
  })
}
