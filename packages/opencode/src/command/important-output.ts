// Parser and checker for /important output.
//
// /important is a prompt template, so the model writes the actual lists. This
// module makes requirements R1-R5 (traceability/nyonas.md) executable: it reads
// one candidate output and reports every requirement it breaks, given the list
// of files in the repo. Pure functions only: no I/O and no model calls.

export interface Entry {
    path: string
    reason: string
  }
  
  export interface Parsed {
    important: Entry[]
    safeToIgnore: Entry[]
    openFirst: string | null
  }
  
  // ---------- parsing ----------
  
  const IMPORTANT_HEADING = /important files/i
  const IGNORE_HEADING = /safe to ignore/i
  const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/
  const BACKTICKED = /`([^`]+)`/
  
  function parseEntry(text: string): Entry | null {
    const ticked = text.match(BACKTICKED)
    if (ticked && text.trimStart().startsWith("`")) {
      const after = text.slice(text.indexOf(ticked[0]) + ticked[0].length)
      return { path: ticked[1].trim(), reason: after.replace(/^\s*[:\-–—]\s*/, "").trim() }
    }
    const split = text.match(/^(\S+?)\s*(?::|\s[-–—])\s*(.*)$/)
    if (split) return { path: split[1].replace(/\*\*/g, "").trim(), reason: split[2].trim() }
    const bare = text.trim()
    return bare ? { path: bare, reason: "" } : null
  }
  
  export function parseImportantOutput(text: string): Parsed {
    const result: Parsed = { important: [], safeToIgnore: [], openFirst: null }
    let section: "important" | "ignore" | null = null
    let lastProse: string | null = null
  
    for (const line of text.split(/\r?\n/)) {
      const bullet = line.match(BULLET)
      if (!bullet) {
        if (IMPORTANT_HEADING.test(line)) section = "important"
        else if (IGNORE_HEADING.test(line)) section = "ignore"
        else if (line.trim()) lastProse = line
        continue
      }
      if (section === null) continue
      const entry = parseEntry(bullet[1])
      if (!entry) continue
      if (section === "important") result.important.push(entry)
      else result.safeToIgnore.push(entry)
    }
  
    // The template ends with one sentence naming the file to open first.
    if (lastProse && /open/i.test(lastProse)) {
      const ticked = lastProse.match(BACKTICKED)
      if (ticked) result.openFirst = ticked[1].trim()
    }
    return result
  }
  
  // Inverse of parseImportantOutput for well-formed outputs (used by the round-trip property).
  export function formatImportantOutput(parsed: Parsed): string {
    const line = (e: Entry) => `- \`${e.path}\`: ${e.reason}`
    const parts = [
      "**Important files**",
      ...parsed.important.map(line),
      "",
      "**Safe to ignore for now**",
      ...parsed.safeToIgnore.map(line),
    ]
    if (parsed.openFirst !== null) parts.push("", `Open \`${parsed.openFirst}\` first.`)
    return parts.join("\n")
  }
  
  // ---------- path helpers ----------
  
  function normalize(p: string): string {
    return p.trim().replace(/^\.\//, "").replace(/\/+$/, "")
  }
  
  function isGlob(p: string): boolean {
    return /[*?]/.test(p)
  }
  
  function globToRegExp(glob: string): RegExp {
    const body = normalize(glob)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\u0000/g, ".*")
    return new RegExp(`^${body}$`)
  }
  
  // Does a list entry (exact path, directory, or glob) cover this repo file?
  export function entryMatches(entry: string, file: string): boolean {
    const f = normalize(file)
    if (isGlob(entry)) {
      const re = globToRegExp(entry)
      // A glob with no "/" (e.g. *.log) matches a file name anywhere, like .gitignore.
      if (!normalize(entry).includes("/")) return re.test(f.split("/").pop()!)
      return re.test(f)
    }
    const e = normalize(entry)
    return f === e || f.startsWith(e + "/")
  }
  
  const GENERATED_SEGMENTS = new Set(["node_modules", "dist", "build", "vendor", "gen"])
  const LOCKFILES = new Set(["package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"])
  
  export function isGenerated(p: string): boolean {
    return normalize(p)
      .split("/")
      .some((seg) => GENERATED_SEGMENTS.has(seg))
  }
  
  export function isLockfile(p: string): boolean {
    return LOCKFILES.has(normalize(p).split("/").pop()!)
  }
  
  // Entry points, build config, test setup, auth, secrets, migrations, production config (R2).
  // Generated output is never protected, even if it looks auth-related (e.g. dist/auth.js).
  export function isProtected(p: string): boolean {
    const f = normalize(p)
    if (isGenerated(f)) return false
    const segs = f.split("/")
    const name = segs[segs.length - 1]
    return (
      /^(src\/)?(index|main)\.[cm]?[jt]sx?$/.test(f) ||
      name === "package.json" ||
      /^tsconfig(\..+)?\.json$/.test(name) ||
      /^(jest|vitest|vite|webpack|babel)\.config\.[cm]?[jt]s$/.test(name) ||
      segs.includes("auth") ||
      name === ".env" ||
      name.startsWith(".env.") ||
      segs.includes("migrations") ||
      (segs[0] === "config" && /prod/.test(name))
    )
  }
  
  function isWorkflow(p: string): boolean {
    const n = normalize(p)
    return n === ".github/workflows" || n.startsWith(".github/workflows/")
  }
  
  // ---------- checking ----------
  
  export function checkImportantOutput(parsed: Parsed, repoFiles: string[]): string[] {
    const out = new Set<string>()
    const files = repoFiles.map(normalize)
    const covered = (entry: string) => files.filter((f) => entryMatches(entry, f))
    const all = [...parsed.important, ...parsed.safeToIgnore]
  
    // R1: generated/vendored paths are never Important.
    for (const e of parsed.important) {
      if (isGenerated(e.path)) out.add(`R1: ${e.path} is generated/vendored but listed as Important`)
    }
  
    // R2: no protected file is covered by any Safe-to-ignore entry.
    for (const e of parsed.safeToIgnore) {
      for (const f of covered(e.path)) {
        if (isProtected(f)) out.add(`R2: ${f} is protected but listed as Safe to ignore`)
      }
    }
  
    // R3: lockfiles in neither list; CI workflows ignorable only with a CI condition.
    for (const e of all) {
      if (isLockfile(e.path)) out.add(`R3: ${e.path} is a lockfile and must appear in neither list`)
      else if (isGlob(e.path)) {
        for (const f of covered(e.path)) {
          if (isLockfile(f)) out.add(`R3: ${f} is a lockfile and must appear in neither list`)
        }
      }
    }
    for (const e of parsed.safeToIgnore) {
      const touchesWorkflow = isWorkflow(e.path + "/") || covered(e.path).some(isWorkflow)
      if (touchesWorkflow && !/\bCI\b/.test(e.reason)) {
        out.add(`R3: ${e.path} is a CI workflow listed as ignorable without a CI condition`)
      }
    }
  
    // R4: every listed path exists; every ignore pattern matches at least one file.
    for (const e of all) {
      if (covered(e.path).length > 0) continue
      if (isGlob(e.path)) out.add(`R4: ignore pattern ${e.path} matches no file in the repo`)
      else out.add(`R4: ${e.path} does not exist in the repo`)
    }
    if (parsed.openFirst !== null && covered(parsed.openFirst).length === 0) {
      out.add(`R4: ${parsed.openFirst} does not exist in the repo`)
    }
  
    // R5: open-first is Important; no path is in both lists.
    const importantPaths = new Set(parsed.important.map((e) => normalize(e.path)))
    if (parsed.openFirst !== null && !importantPaths.has(normalize(parsed.openFirst))) {
      out.add(`R5: open-first file ${parsed.openFirst} is not in the Important list`)
    }
    for (const e of parsed.safeToIgnore) {
      if (importantPaths.has(normalize(e.path))) {
        out.add(`R5: ${e.path} appears in both the Important and Safe-to-ignore lists`)
      }
    }
  
    return [...out]
  }
  
  export * as ImportantOutput from "./important-output"