import type { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Permission } from "@/permission"

export * as Orient from "./orient"

// The deterministic shell around /orient's model call: the permission rules it
// runs under and the files it hands the model. The summary text itself is still
// written by the model.

export const AGENT = "orient"

export const NO_README = "No README was found in this repository."

// A redirect, a chained command, or git's own --output flag turns a read-only git
// command into one that can write a file or run something else, so a command
// containing any of these goes back behind a permission prompt.
const UNSAFE = [">", "<", "|", ";", "&", "$", "`", "(", "\n", "--output"]

export function permission(defaults: PermissionV1.Ruleset, user: PermissionV1.Ruleset) {
  return Permission.merge(
    defaults,
    Permission.fromConfig({ bash: { "*": "ask", "git status *": "allow", "git log *": "allow" } }),
    // A ruleset of their own, so they stay after the allow rules however
    // fromConfig orders the rules inside one ruleset (it sorts by specificity).
    Permission.fromConfig({ bash: Object.fromEntries(UNSAFE.map((token) => [`*${token}*`, "ask" as const])) }),
    user,
    // Placed after the user's rules so that no config can let /orient write files
    // or hand the work to a subagent that can.
    Permission.fromConfig({ edit: "deny", task: "deny" }),
  )
}

const README = /^readme(\.[a-z0-9]+)?$/i
const MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
]
const ENTRYPOINT = /^((src|app|cmd|lib)\/)?(main|index|app|cli)\.[a-z0-9]+$/i
const SKIPPED = /(^|\/)(node_modules|\.git|dist|build|vendor|target|\.venv)\//
const IGNORED_WORDS = new Set(["focus", "the", "and", "for", "with", "about", "how", "what", "this", "that", "please"])
const BASE_LIMIT = 6
const FOCUS_LIMIT = 6

// Chooses the files /orient reads from a listing of repository-relative paths.
// The model does not choose them, so two runs on the same repository read the
// same files.
export function select(input: { files: string[]; focus: string }) {
  // Sorting a de-duplicated copy makes the result independent of the order the
  // filesystem happens to list files in.
  const files = [...new Set(input.files.map((file) => file.replaceAll("\\", "/")))]
    .filter((file) => !SKIPPED.test(file))
    .sort()
  const readme = files.filter((file) => README.test(file))
  const manifest = files.filter((file) => MANIFESTS.includes(file))
  const known = [...readme, ...manifest, ...files.filter((file) => ENTRYPOINT.test(file))].slice(0, BASE_LIMIT)
  // Nothing recognizable: read the first few files so there is always something to cite.
  const base = known.length > 0 ? known : files.slice(0, 3)
  const words = (input.focus.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length > 2 && !IGNORED_WORDS.has(word),
  )
  const focused = files.filter((file) => !base.includes(file) && mentions(file, words)).slice(0, FOCUS_LIMIT)
  return { files: [...base, ...focused], readme: readme.length > 0, manifest: manifest.length > 0 }
}

// Compares whole path segments and name parts, so "test" matches tests/ and
// add.test.ts but not latest.ts.
function mentions(file: string, words: string[]) {
  const parts = file.toLowerCase().split(/[^a-z0-9]+/)
  return words.some((word) => parts.some((part) => part === word || part === word + "s" || part + "s" === word))
}

export function footer(selection: { files: string[] }) {
  return "Files read: " + (selection.files.length > 0 ? selection.files.join(", ") : "none")
}

// The block appended to the /orient prompt so the model reads and cites the
// files chosen above instead of picking its own.
export function brief(selection: { files: string[]; readme: boolean }) {
  return [
    "## Files to read",
    "",
    "/orient chose these files itself, and they replace the investigation order above. Read exactly these files, in this order, and no others:",
    ...(selection.files.length > 0
      ? selection.files.map((file) => `- ${file}`)
      : ["(the repository has no readable files)"]),
    "",
    ...(selection.readme ? [] : [`Begin your answer with this exact sentence: ${NO_README}`]),
    "After the summary, end your answer with this exact line, which does not count toward the sentence limit:",
    footer(selection),
  ].join("\n")
}
