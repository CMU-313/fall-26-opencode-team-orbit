// Property-based tests for /important requirements R1-R5 (see traceability/nyonas.md).
//
// /important's lists are written by the model, so these properties test the
// checker in src/command/important-output.ts: for every generated repo and
// candidate output, the checker must report exactly the violations that the
// requirement wording predicts. The expected violations come from small oracles
// written below from the requirement text, not from the module under test, so
// a bug in the module cannot hide by agreeing with itself.

import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  checkImportantOutput,
  formatImportantOutput,
  parseImportantOutput,
  type Entry,
  type Parsed,
} from "../../src/command/important-output"

// ---------- generators ----------
//
// The repo is a random subset of a fixed pool so that every run mixes the file
// kinds the requirements care about. Each group is labeled by hand from the
// requirement wording; the oracles below use these labels, not the module's rules.

// R2: entry points, build config, test setup, auth, secrets, migrations, prod config.
const PROTECTED = [
  "src/index.ts",
  "src/index.js",
  "package.json",
  "jest.config.js",
  "src/auth/login.ts",
  "src/auth/session.ts",
  ".env",
  "db/migrations/001_init.sql",
  "config/application-prod.yml",
]
// R1: generated or vendored. dist/auth.js looks auth-related but is build output,
// which is the boundary between R1 and R2.
const GENERATED = [
  "node_modules/react/index.js",
  "dist/main.js",
  "dist/auth.js",
  "build/app.js",
  "vendor/lib.js",
  "gen/user_pb.js",
]
// R3: lockfiles and CI workflows.
const LOCKFILES = ["package-lock.json", "bun.lock", "yarn.lock"]
const WORKFLOWS = [".github/workflows/grade.yml", ".github/workflows/test.yml"]
// Files no requirement says anything about.
const ORDINARY = ["README.md", "docs/guide.md", "src/utils/format.ts", "src/components/Button.tsx", "app.log", "scripts/release.sh"]

const POOL = [...PROTECTED, ...GENERATED, ...LOCKFILES, ...WORKFLOWS, ...ORDINARY]

// Directory entries, with and without a trailing slash, so one entry can cover
// several files (e.g. "src/" covers src/auth/login.ts, which R2 must catch).
const DIRS = ["src/", "src/auth/", "src/auth", "node_modules/", "dist/", "db/migrations/", ".github/", ".github/workflows/", "docs/", "config/"]
// Ignore patterns: "*.json" covers both package.json (R2) and package-lock.json (R3);
// "*.lock" covers lockfiles; "*.tmp" matches nothing (R4); "src/*" covers only direct children.
const PATTERNS = ["*.log", "*.md", "*.json", "*.lock", "*.tmp", "dist/*", "src/*"]
// R4: paths that are never in the repo.
const MISSING = ["src/routes.js", "lib/missing.ts", "tmp/"]

// Reasons with and without a CI condition. "specific setup" contains lowercase
// "ci" but no CI condition, so a case-insensitive check would be caught.
const REASONS = ["entrypoint", "core logic", "generated output", "ignore unless CI fails", "only matters when CI breaks", "specific setup", "editor config"]

const repoArb = fc.uniqueArray(fc.constantFrom(...POOL), { minLength: 1, maxLength: POOL.length })

// An entry path is biased toward files actually in the repo (so a generated
// file, lockfile, or protected file can land in the wrong list), but can also be
// a directory, a pattern, or a missing path.
const entryArb = (repo: string[]) =>
  fc.record({
    path: fc.oneof(
      { weight: 4, arbitrary: fc.constantFrom(...repo) },
      { weight: 2, arbitrary: fc.constantFrom(...DIRS) },
      { weight: 2, arbitrary: fc.constantFrom(...PATTERNS) },
      { weight: 1, arbitrary: fc.constantFrom(...MISSING) },
      { weight: 1, arbitrary: fc.constantFrom(...POOL) },
    ),
    reason: fc.constantFrom(...REASONS),
  })

// Lists may be empty, and the same path can show up in both lists (R5).
const caseArb = repoArb.chain((repo) =>
  fc.record({
    repo: fc.constant(repo),
    parsed: fc.record({
      important: fc.array(entryArb(repo), { maxLength: 8 }),
      safeToIgnore: fc.array(entryArb(repo), { maxLength: 6 }),
      openFirst: fc.option(fc.oneof(fc.constantFrom(...repo), fc.constantFrom(...MISSING)), { nil: null }),
    }),
  }),
)

// ---------- oracles (written from the requirement text) ----------

const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/+$/, "")
const isPattern = (p: string) => p.includes("*")

// The only entry forms the generators produce: exact path, directory, "*.ext", "dir/*".
function covers(entry: string, file: string): boolean {
  if (entry.startsWith("*.")) return file.endsWith(entry.slice(1))
  if (entry.endsWith("/*")) {
    const dir = entry.slice(0, -1)
    return file.startsWith(dir) && !file.slice(dir.length).includes("/")
  }
  const e = norm(entry)
  return file === e || file.startsWith(e + "/")
}

// R1 wording: node_modules, dist, vendor, gen, and build output.
const looksGenerated = (p: string) =>
  norm(p)
    .split("/")
    .some((seg) => ["node_modules", "dist", "build", "vendor", "gen"].includes(seg))
const isLock = (p: string) => LOCKFILES.includes(norm(p).split("/").pop()!)

const only = (violations: string[], id: string) => [...new Set(violations.filter((v) => v.startsWith(id + ":")))].sort()
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort()

// ---------- properties ----------

describe("/important output checker properties", () => {
  // R1 (invariant): "Generated or vendored files are never listed as Important."
  // For every output, the checker flags exactly the Important entries that are
  // generated or vendored, and nothing else under R1.
  test("R1 (invariant)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const expected = parsed.important
          .filter((e) => looksGenerated(e.path))
          .map((e) => `R1: ${e.path} is generated/vendored but listed as Important`)
        expect(only(checkImportantOutput(parsed, repo), "R1")).toEqual(sorted(expected))
      }),
    )
  })

  // R2 (invariant): "Entry points, build config, test setup, auth, secrets handling,
  // migrations, and production config are never listed as Safe to ignore."
  // Every protected repo file matched by any Safe-to-ignore entry is flagged.
  test("R2 (invariant)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const expected = repo
          .filter((f) => PROTECTED.includes(f))
          .filter((f) => parsed.safeToIgnore.some((e) => covers(e.path, f)))
          .map((f) => `R2: ${f} is protected but listed as Safe to ignore`)
        expect(only(checkImportantOutput(parsed, repo), "R2")).toEqual(sorted(expected))
      }),
    )
  })

  // R3 (conditional invariant): "Lockfiles appear in neither list, and CI workflow
  // files are only marked ignorable with a CI condition."
  // Lockfiles are always flagged; a CI workflow is flagged only when it is under
  // Safe to ignore AND its reason has no "CI".
  test("R3 (conditional invariant)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const expected: string[] = []
        for (const e of [...parsed.important, ...parsed.safeToIgnore]) {
          if (isLock(e.path)) expected.push(`R3: ${e.path} is a lockfile and must appear in neither list`)
          else if (isPattern(e.path))
            for (const f of repo.filter((f) => isLock(f) && covers(e.path, f)))
              expected.push(`R3: ${f} is a lockfile and must appear in neither list`)
        }
        for (const e of parsed.safeToIgnore) {
          const touchesCI =
            norm(e.path).startsWith(".github/workflows") || repo.some((f) => WORKFLOWS.includes(f) && covers(e.path, f))
          if (touchesCI && !e.reason.includes("CI"))
            expected.push(`R3: ${e.path} is a CI workflow listed as ignorable without a CI condition`)
        }
        expect(only(checkImportantOutput(parsed, repo), "R3")).toEqual(sorted(expected))
      }),
    )
  })

  // R4 (invariant): "Every path in the output exists in the repo."
  // Every listed path that matches no repo file is flagged, with the pattern
  // message for ignore patterns; the open-first file must exist too.
  test("R4 (invariant)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const expected: string[] = []
        for (const e of [...parsed.important, ...parsed.safeToIgnore]) {
          if (repo.some((f) => covers(e.path, f))) continue
          expected.push(
            isPattern(e.path)
              ? `R4: ignore pattern ${e.path} matches no file in the repo`
              : `R4: ${e.path} does not exist in the repo`,
          )
        }
        if (parsed.openFirst !== null && !repo.some((f) => covers(parsed.openFirst!, f)))
          expected.push(`R4: ${parsed.openFirst} does not exist in the repo`)
        expect(only(checkImportantOutput(parsed, repo), "R4")).toEqual(sorted(expected))
      }),
    )
  })

  // R5 (invariant): "An /important output is self-consistent: the open-first file is
  // a member of the Important list, and no path appears in both the Important and
  // Safe-to-ignore lists."
  test("R5 (invariant)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const important = new Set(parsed.important.map((e) => norm(e.path)))
        const expected: string[] = []
        if (parsed.openFirst !== null && !important.has(norm(parsed.openFirst)))
          expected.push(`R5: open-first file ${parsed.openFirst} is not in the Important list`)
        for (const e of parsed.safeToIgnore)
          if (important.has(norm(e.path)))
            expected.push(`R5: ${e.path} appears in both the Important and Safe-to-ignore lists`)
        expect(only(checkImportantOutput(parsed, repo), "R5")).toEqual(sorted(expected))
      }),
    )
  })

  // R5 (metamorphic): "reordering the entries does not change the checker's verdict."
  // Reversing both lists must give the same set of violations, for every requirement.
  test("R5 (metamorphic)", () => {
    fc.assert(
      fc.property(caseArb, ({ repo, parsed }) => {
        const reversed: Parsed = {
          important: [...parsed.important].reverse(),
          safeToIgnore: [...parsed.safeToIgnore].reverse(),
          openFirst: parsed.openFirst,
        }
        expect(sorted(checkImportantOutput(reversed, repo))).toEqual(sorted(checkImportantOutput(parsed, repo)))
      }),
    )
  })

  // Parser (round-trip), supports R1-R5: every check above judges parsed output,
  // so parsing the text form of an output must give back the same entries,
  // reasons, and open-first file. Reasons are multi-word and may contain "CI",
  // and lists may be empty, which covers the separator and empty-section cases.
  test("Parser (round-trip)", () => {
    const pathArb = fc.constantFrom(...POOL, ...DIRS, ...PATTERNS, ...MISSING)
    const reasonArb = fc
      .array(fc.constantFrom("entrypoint", "core", "logic", "CI", "ignore", "unless", "fails", "config", "for", "now"), {
        minLength: 1,
        maxLength: 5,
      })
      .map((words) => words.join(" "))
    const entry: fc.Arbitrary<Entry> = fc.record({ path: pathArb, reason: reasonArb })
    const parsedArb: fc.Arbitrary<Parsed> = fc.record({
      important: fc.array(entry, { maxLength: 10 }),
      safeToIgnore: fc.array(entry, { maxLength: 5 }),
      openFirst: fc.option(pathArb, { nil: null }),
    })
    fc.assert(
      fc.property(parsedArb, (parsed) => {
        expect(parseImportantOutput(formatImportantOutput(parsed))).toEqual(parsed)
      }),
    )
  })
})
