// Property-based tests for /orient requirements R1-R7 (see traceability/alexjack.md).
//
// /orient's summary is written by the model, which CI cannot call. These
// properties check the deterministic shell around that call, in
// src/command/orient.ts: the permission rules /orient runs under (R1-R3) and the
// files it chooses and tells the model to cite (R4-R7).

import { afterAll, afterEach, expect, test } from "bun:test"
import fc from "fast-check"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Orient } from "../../src/command/orient"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

afterEach(async () => {
  await disposeAllInstances()
})

// ---------- generators: permissions (R1-R3) ----------

// Paths an edit could target. The fixed entries are the boundaries interviewees
// and the code care about: ordinary project files, dotfiles, names with spaces,
// paths that escape the repo, and opencode's own plan notes, which the plan
// agent is allowed to write.
const path = fc.oneof(
  fc.constantFrom(
    "README.md",
    "package.json",
    "src/index.ts",
    ".env",
    "docs/my notes.md",
    "../outside.txt",
    "/etc/hosts",
    ".opencode/plans/plan.md",
    ".opencode/plans/orient.md",
  ),
  fc.array(fc.stringMatching(/^[A-Za-z0-9._-]{1,8}$/), { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/")),
  fc.string({ minLength: 1 }),
)

// A user's own permission config. It includes the rules most likely to loosen
// /orient: a blanket allow, and allow rules for edit on any path.
const userRules = fc.array(
  fc.record({
    permission: fc.constantFrom("edit", "bash", "read", "task", "*"),
    pattern: fc.oneof(fc.constant("*"), path),
    action: fc.constantFrom("allow", "ask", "deny"),
  }),
  { maxLength: 6 },
)

// Read-only git, the only commands R2 lets run without asking.
const GIT_ARGS = [
  "--short",
  "--porcelain",
  "-sb",
  "--oneline",
  "-n",
  "5",
  "--stat",
  "HEAD~3",
  "main",
  "--",
  "src",
  "README.md",
]
const readOnlyGitCommand = fc
  .tuple(fc.constantFrom("git status", "git log"), fc.subarray(GIT_ARGS))
  .map((input) => [input[0], ...input[1]].join(" "))

// Install, test, and destructive commands interviewees named (C-5, O-6, O-12),
// plus near-misses of the allowed commands such as "git statusx" and "git logs".
const INSTALL_OR_TEST = [
  "npm install",
  "npm test",
  "npm run build",
  "bun install",
  "bun test",
  "yarn install",
  "pytest",
  "make",
]
const OTHER = [
  ...INSTALL_OR_TEST,
  "pip install -r requirements.txt",
  "cargo build",
  "rm -rf node_modules",
  "git commit -m wip",
  "git push",
  "git checkout .",
  "git reset --hard",
  "git clean -fd",
  "git add .",
  "git stash",
  "git statusx",
  "git logs",
  "gitstatus",
  "git",
  "ls -la",
  "cat README.md",
]
const otherCommand = fc
  .tuple(fc.constantFrom(...OTHER), fc.oneof(fc.constant(""), fc.string()))
  .map((input) => (input[1] ? `${input[0]} ${input[1]}` : input[0]))

// Read-only git commands made unsafe: redirected into a file, chained with a
// second command, or told to write their own output file.
const WRITES = [
  "> out.txt",
  ">> README.md",
  "< input.txt",
  "| tee notes.txt",
  "&& rm -rf .",
  "& npm test",
  "; npm install",
  "--output=log.txt",
  "$(npm test)",
  "`npm test`",
  "(touch x)",
  "\nnpm install",
]
const disguisedCommand = fc
  .tuple(readOnlyGitCommand, fc.constantFrom(...WRITES))
  .map((input) => `${input[0]} ${input[1]}`)

const gitWithAnyTail = fc
  .tuple(fc.constantFrom("git status", "git log"), fc.string())
  .map((input) => `${input[0]} ${input[1]}`)

const command = fc.oneof(readOnlyGitCommand, otherCommand, disguisedCommand, gitWithAnyTail, fc.string())

// Oracle for R2, written from the requirement wording and not from the rules in
// the module: a command is read-only git when it is `git status` or `git log`
// and nothing in it redirects, chains, substitutes, or writes an output file.
const UNSAFE = [">", "<", "|", ";", "&", "$", "`", "(", "\n", "--output"]
function readOnlyGit(input: string) {
  const words = input.split(" ")
  return (
    words[0] === "git" &&
    (words[1] === "status" || words[1] === "log") &&
    !UNSAFE.some((token) => input.includes(token))
  )
}

// The most permissive baseline, so a passing property is due to /orient's rules
// and not to a restrictive default.
const OPEN = Permission.fromConfig({ "*": "allow" })
const decide = (permission: string, pattern: string, user: Parameters<typeof Orient.permission>[1] = []) =>
  Permission.evaluate(permission, pattern, Orient.permission(OPEN, user)).action

// ---------- properties: permissions (R1-R3) ----------

// R1: /orient runs under a permission set in which editing is denied for every
// path, and no user config can loosen that.
// Kind: invariant
test("R1 (invariant): no path can be edited, whatever the user's config says", () => {
  fc.assert(
    fc.property(userRules, path, (user, target) => {
      expect(decide("edit", target, user)).toBe("deny")
    }),
  )
})

// R1 and R2, checked on the agent the running command actually uses, with the
// real default rules instead of the open baseline above.
// Kind: invariant (R1), model/oracle (R2)
it.instance("R1, R2 (wiring): the agent /orient is bound to denies edits and only runs read-only git unasked", () =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service.use((svc) => svc.get(Orient.AGENT))
    expect(agent).toBeDefined()
    fc.assert(
      fc.property(path, (target) => {
        expect(Permission.evaluate("edit", target, agent!.permission).action).toBe("deny")
      }),
    )
    fc.assert(
      fc.property(command, (input) => {
        expect(Permission.evaluate("bash", input, agent!.permission).action).toBe(readOnlyGit(input) ? "allow" : "ask")
      }),
    )
  }),
)

// R2: Under /orient, the only shell commands that run without a permission
// prompt are `git status` and `git log` with plain arguments.
// Kind: model/oracle (the rules must agree with the readOnlyGit oracle above)
test("R2 (model/oracle): a command runs unasked only if it is read-only git", () => {
  fc.assert(
    fc.property(command, (input) => {
      expect(decide("bash", input)).toBe(readOnlyGit(input) ? "allow" : "ask")
    }),
  )
})

// R2: install and test commands never run on their own.
// Kind: metamorphic (appending anything to an install or test command never
// makes it runnable)
test("R2 (metamorphic): adding arguments to an install or test command never makes it run unasked", () => {
  fc.assert(
    fc.property(fc.constantFrom(...INSTALL_OR_TEST), fc.string(), (head, tail) => {
      expect(decide("bash", head)).toBe("ask")
      expect(decide("bash", `${head} ${tail}`)).toBe("ask")
    }),
  )
})

// R3: Every shell command that is not read-only git goes through opencode's
// permission prompt, and a user rule that denies a command still denies it.
// Kind: metamorphic (adding a user deny rule for one tool changes that tool's
// commands from ask to deny and changes nothing else)
test("R3 (metamorphic): a user deny rule turns ask into deny for that tool and leaves the rest unchanged", () => {
  fc.assert(
    fc.property(fc.constantFrom("npm", "bun", "rm", "make"), command, (tool, input) => {
      const denied = Permission.fromConfig({ bash: { [`${tool} *`]: "deny" } })
      const targeted = input === tool || input.startsWith(tool + " ")
      expect(decide("bash", input, denied)).toBe(targeted ? "deny" : decide("bash", input))
      if (!readOnlyGit(input)) expect(decide("bash", input, denied)).not.toBe("allow")
    }),
  )
})

// ---------- generators: file selection (R4-R7) ----------
//
// A repository is a random subset of each labelled pool, listed in random order.
// The labels are written by hand from the requirement wording and are what the
// properties compare against, so the module cannot pass by agreeing with itself.

const READMES = ["README.md", "README", "readme.rst"]
const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]
const ENTRYPOINTS = ["src/index.ts", "main.py", "cmd/main.go", "app.js"]
// Files a "test" focus should bring in (S-10).
const TESTS = ["tests/unit/add.test.ts", "test/setup.ts", "src/__tests__/api.test.js", "tests/conftest.py"]
// docs/README.md is a README that is not at the root, so it must not count as
// one (R7). src/latest.ts contains "test" inside a word and must not match (R6).
const ORDINARY = [
  "docs/guide.md",
  "docs/README.md",
  "LICENSE",
  "src/utils/format.ts",
  "src/latest.ts",
  "src/db/schema.sql",
  "notes.txt",
]
// Never worth reading. node_modules/tests/index.js looks like a test file.
const GENERATED = [
  "node_modules/react/index.js",
  "node_modules/tests/index.js",
  "dist/main.js",
  "build/app.js",
  ".git/config",
]

const repo = fc
  .record({
    readme: fc.subarray(READMES),
    manifest: fc.subarray(MANIFESTS),
    entry: fc.subarray(ENTRYPOINTS),
    tests: fc.subarray(TESTS),
    ordinary: fc.subarray(ORDINARY),
    generated: fc.subarray(GENERATED),
  })
  .chain((parts) => {
    const real = [...parts.readme, ...parts.manifest, ...parts.entry, ...parts.tests, ...parts.ordinary]
    const all = [...real, ...parts.generated]
    return fc.shuffledSubarray(all, { minLength: all.length }).map((files) => ({ ...parts, real, files }))
  })

const testFocus = fc.constantFrom("focus on the test setup", "tests", "the TEST suite", "test")
const anyFocus = fc.oneof(fc.constant(""), testFocus, fc.string())

// ---------- properties: file selection (R4-R7) ----------

// R4: /orient computes the "Files read" line itself. It names at least one path
// whenever the repo has a readable file, lists each path once, and every path
// exists in the repo and is not generated or vendored.
// Kind: invariant
test("R4 (invariant): the Files read line names real, existing, non-generated files", () => {
  fc.assert(
    fc.property(repo, anyFocus, (input, focus) => {
      const selection = Orient.select({ files: input.files, focus })
      if (input.real.length > 0) expect(selection.files.length).toBeGreaterThan(0)
      expect(new Set(selection.files).size).toBe(selection.files.length)
      for (const file of selection.files) {
        expect(input.real).toContain(file)
        expect(GENERATED).not.toContain(file)
      }
      const lines = Orient.brief(selection).split("\n")
      expect(lines.at(-1)).toBe("Files read: " + (selection.files.length > 0 ? selection.files.join(", ") : "none"))
    }),
  )
})

// R5: The files /orient reads are chosen by its own selection logic, not by the
// model, so two runs on an unchanged repo read the same files.
// Kind: metamorphic (listing the same files in another order, or twice, does
// not change the selection)
test("R5 (metamorphic): the selection does not depend on listing order or duplicates", () => {
  fc.assert(
    fc.property(
      repo.chain((input) =>
        fc.shuffledSubarray([...input.files, ...input.files], { minLength: input.files.length * 2 }).map((again) => ({
          files: input.files,
          again,
        })),
      ),
      anyFocus,
      (input, focus) => {
        expect(Orient.select({ files: input.again, focus })).toEqual(Orient.select({ files: input.files, focus }))
      },
    ),
  )
})

// R6: With a focus, /orient reads the same base files as without one, plus
// files whose path matches a focus word, and every added file matches the focus.
// Kind: metamorphic (adding a focus only adds files, and only matching ones)
test("R6 (metamorphic): a focus adds matching files and never drops a base file", () => {
  fc.assert(
    fc.property(repo, testFocus, fc.string(), (input, focus, noise) => {
      const plain = Orient.select({ files: input.files, focus: "" })
      const focused = Orient.select({ files: input.files, focus })
      expect(focused.files.slice(0, plain.files.length)).toEqual(plain.files)
      for (const file of focused.files.slice(plain.files.length)) expect(TESTS).toContain(file)
      if (input.tests.length > 0) expect(focused.files.some((file) => TESTS.includes(file))).toBe(true)
      expect(Orient.brief(focused).split("\n").at(-1)).toBe(Orient.footer(focused))
      // Any other focus text may add files but still keeps the base files.
      expect(Orient.select({ files: input.files, focus: noise }).files.slice(0, plain.files.length)).toEqual(
        plain.files,
      )
    }),
  )
})

// R7: /orient decides whether a root README exists. When none does, it tells the
// model to open with "No README was found in this repository.", and it still
// selects at least one file to read whenever the repo has any.
// Kind: invariant
test("R7 (invariant): the no-README notice appears exactly when there is no root README", () => {
  fc.assert(
    fc.property(repo, anyFocus, (input, focus) => {
      const selection = Orient.select({ files: input.files, focus })
      expect(selection.readme).toBe(input.readme.length > 0)
      expect(selection.manifest).toBe(input.manifest.length > 0)
      expect(Orient.brief(selection).includes(Orient.NO_README)).toBe(input.readme.length === 0)
      if (input.readme.length === 0 && input.manifest.length === 0 && input.real.length > 0)
        expect(selection.files.length).toBeGreaterThan(0)
    }),
  )
})

// bun test runs with --only-failures in CI, which hides passing tests. This line
// makes the CI log show that these properties actually ran.
afterAll(() => {
  console.log("[orient.property] ran 9 properties for R1-R7, 100 generated cases each")
})
