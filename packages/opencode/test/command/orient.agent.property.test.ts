// Property written by opencode (plan agent, deepseek-flash) for R6 on
// 2026-11-12, saved verbatim for the Project 5 agent failure case. See
// traceability/alexjack.md, "Agent failure case".
import { test, expect } from "bun:test"
import fc from "fast-check"
import { Orient } from "../../src/command/orient"

const IGNORED = new Set(["focus", "the", "and", "for", "with", "about", "how", "what", "this", "that", "please"])

// A word-like token that survives /orient's focus-word filter.
const token = fc.stringMatching(/^[a-z]{4,8}$/).filter((word) => !IGNORED.has(word))

// Generator: build a pool of tokens, then derive file paths and a focus from it so
// that focus words often appear in file paths (exercising the "added file" branch).
const scenario = fc.uniqueArray(token, { minLength: 1, maxLength: 8 }).chain((pool) => {
  const part = fc.constantFrom(...pool)
  const file = fc.array(part, { minLength: 1, maxLength: 4 }).map((segments) => `${segments.join("/")}.ts`)
  const focus = fc.array(part, { minLength: 0, maxLength: 3 }).map((words) => words.join(" "))
  return fc.tuple(fc.array(file, { minLength: 0, maxLength: 12 }), focus)
})

const focusWords = (focus: string) =>
  (focus.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 2 && !IGNORED.has(word))

const pathParts = (file: string) => file.toLowerCase().split(/[^a-z0-9]+/)

const matchesFocus = (file: string, words: string[]) =>
  words.some((word) => pathParts(file).some((part) => part === word || part === `${word}s` || `${part}s` === word))

test("R6: focus keeps the base files, adds only matching files, and keeps the Files read footer", () => {
  fc.assert(
    fc.property(scenario, ([files, focus]) => {
      const plain = Orient.select({ files, focus: "" })
      const focused = Orient.select({ files, focus })

      // The base selection (no focus) is preserved as a prefix.
      expect(focused.files.slice(0, plain.files.length)).toEqual(plain.files)

      // Every file added by the focus matches one of the focus words.
      const added = focused.files.slice(plain.files.length)
      const words = focusWords(focus)
      expect(added.filter((file) => !matchesFocus(file, words))).toEqual([])

      // The brief still ends with the exact "Files read" list.
      const text = Orient.brief(focused)
      expect(text.split("\n").at(-1)).toBe(Orient.footer(focused))
      expect(text.endsWith(Orient.footer(focused))).toBe(true)
    }),
  )
})

// ---------- strengthened version (alexjack, Project 5) ----------
//
// Three changes to the property above. The generator now also produces names
// that only contain a focus word inside of a longer word (la<word>.ts, like
// latest.ts for "test"), lists paths more than once, and sometimes includes a
// readme and manifest so the base files are not just the first three paths.
// The oracle is the requirement's own wording (a focus word is a whole path
// segment or name part) instead of a copy of the module's matching code. And
// it checks what the agent's version did not, an added file is new, nothing
// is listed twice, and a focus that matches something adds something

const word = fc.stringMatching(/^[a-z]{4,8}$/).filter((text) => !IGNORED.has(text) && !text.endsWith("s"))
const repo = fc.uniqueArray(word, { minLength: 1, maxLength: 8 }).chain((pool) => {
  const segments = fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 4 })
  const file = fc.oneof(
    segments.map((parts) => `${parts.join("/")}.ts`),
    segments.map((parts) => [...parts.slice(0, -1), `la${parts.at(-1)}`].join("/") + ".ts"),
  )
  const focus = fc.array(fc.constantFrom(...pool), { minLength: 0, maxLength: 3 }).map((words) => words.join(" "))
  return fc.tuple(
    fc.tuple(fc.array(file, { minLength: 0, maxLength: 12 }), fc.subarray(["README.md", "package.json"])),
    focus,
  )
})

test("R6 (strengthened): a focus adds only new, whole-word matches, and adds one when one exists", () => {
  fc.assert(
    fc.property(repo, ([[listed, extras], focus]) => {
      const files = [...listed, ...extras]
      const words = focus.split(" ").filter(Boolean)
      const matches = (file: string) =>
        file
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .some((part) => words.includes(part))
      const plain = Orient.select({ files, focus: "" })
      const focused = Orient.select({ files, focus })
      expect(focused.files.slice(0, plain.files.length)).toEqual(plain.files)
      const added = focused.files.slice(plain.files.length)
      for (const file of added) {
        expect(matches(file)).toBe(true)
        expect(plain.files).not.toContain(file)
      }
      expect(new Set(focused.files).size).toBe(focused.files.length)
      const candidates = [...new Set(files)].filter((file) => matches(file) && !plain.files.includes(file))
      if (candidates.length > 0) expect(added.length).toBeGreaterThan(0)
      expect(Orient.brief(focused).split("\n").at(-1)).toBe(Orient.footer(focused))
    }),
  )
})
