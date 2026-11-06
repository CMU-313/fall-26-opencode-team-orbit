// Property-based tests for the permission rules feature (Project 4).
// Each property checks one requirement from traceability/justinku.md.

import { test, expect } from "bun:test"
import fc from "fast-check"
import { Effect, Fiber, Layer } from "effect"
import * as TestConsole from "effect/testing/TestConsole"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Permission } from "../../src/permission"
import { BashArity } from "../../src/permission/arity"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { SessionID } from "../../src/session/schema"
import { withTmpdirInstance } from "../fixture/fixture"

type Action = "allow" | "ask" | "deny"
type Entry = [pattern: string, action: Action]

// ---------------------------------------------------------------------------
// Generators
//
// Commands are built from a small vocabulary instead of random strings. Random
// strings almost never match a rule, so they would never reach the cases the
// interviewees cared about. The vocabulary includes:
//   - rm, chmod and chown, the commands every interviewee said must not run
//     silently (S-2, O-2, C-2);
//   - near misses that must NOT be treated as those commands: "rmdir" starts
//     with "rm", and "rm" also appears as an argument ("echo rm");
//   - flags such as -rf, -f and --force, which change what a command does.
// ---------------------------------------------------------------------------

const PROTECTED = ["rm", "chmod", "chown"]
const OTHER = ["git", "npm", "ls", "cat", "echo", "rmdir"]
const ARGS = ["push", "status", "checkout", "main", "build", "x.sh", "-rf", "-f", "--force", "777", "root", "/", "rm"]

const action = fc.constantFrom<Action>("allow", "ask", "deny")

const command = (names: string[]) =>
  fc
    .tuple(fc.constantFrom(...names), fc.array(fc.constantFrom(...ARGS), { maxLength: 3 }))
    .map(([name, args]) => [name, ...args].join(" "))

// Builds a pattern that is guaranteed to match `text`: keep some characters and
// replace every run of dropped characters with "*". Keeping everything gives an
// exact pattern, keeping nothing gives "*", and anything in between gives
// patterns like "git p*" or "git *h". This is how the generators produce several
// rules of different specificity that all match the same command, which is the
// only situation where rule precedence matters.
const patternFrom = (text: string, keep: (index: number) => boolean) =>
  [...text]
    .map((char, index) => (keep(index) ? char : "*"))
    .join("")
    .replace(/\*+/g, "*")

// A command plus 1 to 6 config rules for the bash tool, in a random order.
// Each rule's pattern is derived either from the command itself (so it matches)
// or from a different command (so it usually does not).
const scenario = (names: string[]) =>
  fc
    .record({
      command: command(names),
      rules: fc.array(
        fc.record({
          source: fc.option(command([...PROTECTED, ...OTHER])),
          mask: fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
          action,
        }),
        { minLength: 1, maxLength: 6 },
      ),
    })
    .map((input) => ({
      command: input.command,
      rules: input.rules
        .map((rule): Entry => [patternFrom(rule.source ?? input.command, (index) => rule.mask[index]), rule.action])
        // A config object cannot hold the same pattern twice.
        .filter(([pattern], index, all) => all.findIndex(([other]) => other === pattern) === index),
    }))

const evaluate = (text: string, rules: Entry[], approved: Entry[] = []) =>
  Permission.evaluate(
    "bash",
    text,
    Permission.fromConfig({ bash: Object.fromEntries(rules) }),
    approved.map(([pattern, action]) => ({ permission: "bash", pattern, action })),
  ).action

// ---------------------------------------------------------------------------
// Reference model used as the oracle for R1.
// It is deliberately slow and obvious: look at every matching rule, keep the
// ones with the most non-wildcard characters, and if those disagree take the
// most restrictive action (R2). No rule matching means "ask".
// ---------------------------------------------------------------------------

const specificity = (pattern: string) => pattern.replace(/[*?]/g, "").length
const strictness = { allow: 0, ask: 1, deny: 2 }
const strictest = (actions: Action[]) => actions.toSorted((a, b) => strictness[b] - strictness[a])[0]

function reference(rules: Entry[], text: string): Action {
  const matching = rules.filter(([pattern]) => Wildcard.match(text, pattern))
  const top = Math.max(...matching.map(([pattern]) => specificity(pattern)))
  return strictest(matching.filter(([pattern]) => specificity(pattern) === top).map(([, action]) => action)) ?? "ask"
}

const isProtected = (text: string) => PROTECTED.includes(text.split(" ")[0])

// R1: When a command matches several rules for the same tool in the config, the
// most specific rule (the one with the most non-wildcard characters) decides the
// outcome, no matter what order the rules are written in. Ties are handled by R2.
// Kind: model / oracle
test("R1: the most specific matching rule decides, whatever the rule order", () => {
  fc.assert(
    fc.property(scenario([...PROTECTED, ...OTHER]), ({ command, rules }) => {
      const expected = reference(rules, command)
      // When the rules would allow rm, chmod or chown, R3 takes over; that case
      // is checked by the R3 properties below.
      fc.pre(!(isProtected(command) && expected === "allow"))
      expect(evaluate(command, rules)).toBe(expected)
    }),
  )
})

// R2: When two rules for the same tool match a command, are equally specific
// (same number of non-wildcard characters), and have different actions, the most
// restrictive action wins no matter the order: deny beats ask, and ask beats allow.
// Kind: metamorphic (writing the same rules in the opposite order must not
// change the result)
//
// Generator: two patterns are made from the same command by keeping two
// different sets of characters of the same size, so both match and both have
// the same specificity ("git p*" and "git *h" for "git push"). The two actions
// are always different. A catch-all "*" rule is sometimes added because that is
// how interviewees wrote their configs; it is less specific, so it must never
// change the answer.
const tie = command([...PROTECTED, ...OTHER]).chain((text) =>
  fc.integer({ min: 1, max: text.length - 1 }).chain((size) => {
    const positions = fc.shuffledSubarray(
      [...text].map((_, index) => index),
      { minLength: size, maxLength: size },
    )
    return fc.record({
      command: fc.constant(text),
      first: positions,
      second: positions,
      actions: fc.shuffledSubarray<Action>(["allow", "ask", "deny"], { minLength: 2, maxLength: 2 }),
      fallback: fc.option(action),
    })
  }),
)

test("R2: equally specific rules that disagree give the most restrictive action in either order", () => {
  fc.assert(
    fc.property(tie, ({ command, first, second, actions, fallback }) => {
      const a = patternFrom(command, (index) => first.includes(index))
      const b = patternFrom(command, (index) => second.includes(index))
      fc.pre(a !== b)
      const pair: Entry[] = [
        [a, actions[0]],
        [b, actions[1]],
      ]
      const rules: Entry[] = fallback ? [["*", fallback], ...pair] : pair
      const expected = strictest(actions)
      expect(evaluate(command, rules)).toBe(expected)
      expect(evaluate(command, rules.toReversed())).toBe(expected)
    }),
  )
})

// R3: A shell command whose command name is rm, chmod, or chown never runs
// without confirmation: if the rules or an earlier "always" approval would allow
// it, the result is ask. A deny rule still denies it. All other commands are
// unaffected.
// Kind: invariant
//
// Generator: any rm/chmod/chown command, any config, and any mix of the "always"
// approvals a user could have given before: for the whole command name
// ("rm *", which is what opencode stores today), for everything ("*"), or for
// the exact command.
test("R3: rm, chmod and chown are never allowed without asking", () => {
  fc.assert(
    fc.property(
      scenario(PROTECTED),
      fc.subarray<"name" | "everything" | "exact">(["name", "everything", "exact"]),
      ({ command, rules }, approvals) => {
        const patterns = { name: command.split(" ")[0] + " *", everything: "*", exact: command }
        const approved = approvals.map((kind): Entry => [patterns[kind], "allow"])
        expect(evaluate(command, rules, approved)).not.toBe("allow")
      },
    ),
  )
})

// R3 (continued): "A deny rule still denies it."
// Kind: invariant
test("R3: a deny rule for rm, chmod or chown still denies", () => {
  fc.assert(
    fc.property(command(PROTECTED), action, (text, fallback) => {
      const name = text.split(" ")[0]
      expect(
        evaluate(text, [
          ["*", fallback],
          [name + " *", "deny"],
        ]),
      ).toBe("deny")
    }),
  )
})

// R3 (continued): "All other commands are unaffected."
// Kind: invariant
// Generator: commands that are not rm/chmod/chown, including "rmdir" and
// commands that only mention rm as an argument.
test("R3: commands other than rm, chmod and chown are unaffected", () => {
  fc.assert(
    fc.property(command(OTHER), (text) => {
      expect(evaluate(text, [["*", "allow"]])).toBe("allow")
    }),
  )
})

// R5: After an "always" approval, a later command with the same command prefix
// (for example git checkout) runs without a prompt only if every flag in it (any
// argument starting with -, including --) also appeared in the approved command.
// Otherwise it is evaluated as if the approval did not exist.
// Kind: invariant
//
// This property drives the real permission service: ask, answer "always", then
// ask again and see whether the second command runs or prompts. Every run gets
// a fresh opencode instance so approvals from one run cannot leak into the next.
//
// Generator: an approved command and a later command that share a command
// prefix. Their arguments are drawn from a short list of flags and plain words,
// so the later command often has exactly the approved flags, a subset, or one
// extra flag. "--" is included because `git checkout -- .` was the example that
// erased work in the interviews (S-5, O-5).
const HEADS = [["git", "checkout"], ["git", "push"], ["npm", "install"], ["ls"]]
const FLAGS = ["-f", "--force", "--", "-b", "-q"]
const WORDS = ["main", "feature-x", ".", "src"]
const tail = fc.array(fc.constantFrom(...FLAGS, ...WORDS), { maxLength: 4 })
const flags = (tokens: string[]) => tokens.filter((token) => token.startsWith("-"))

// Same service setup as test/permission/next.test.ts.
const env = Layer.provideMerge(
  AppNodeBuilder.build(
    LayerNode.group([Permission.node, EventV2Bridge.node, CrossSpawnSpawner.node, InstanceStore.node]),
    [
      [
        InstanceStore.bootstrapNode,
        Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
      ],
    ],
  ),
  TestConsole.layer,
)

// The request the shell tool sends for one command: the command itself, plus
// the generalized pattern that is saved if the user answers "always"
// (see `scan.always.add(...)` in src/tool/shell.ts).
const request = (tokens: string[]) => ({
  sessionID: SessionID.make("session_property"),
  permission: "bash",
  patterns: [tokens.join(" ")],
  always: [BashArity.prefix(tokens).join(" ") + " *"],
  metadata: {},
  ruleset: [],
})

const pending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    while ((yield* permission.list()).length !== count) yield* Effect.sleep("1 millis")
    return yield* permission.list()
  })

// Approves `approved` with "always", then reports whether `later` runs straight
// away ("runs") or stops to ask the user ("prompts").
const afterAlways = (approved: string[], later: string[]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    const first = yield* permission.ask(request(approved)).pipe(Effect.forkScoped)
    const [asked] = yield* pending(1)
    yield* permission.reply({ requestID: asked.id, reply: "always" })
    yield* Fiber.join(first)
    return yield* Effect.raceFirst(
      permission.ask(request(later)).pipe(Effect.as("runs" as const)),
      pending(1).pipe(Effect.as("prompts" as const)),
    )
  }).pipe(withTmpdirInstance(), Effect.scoped, Effect.provide(env), Effect.runPromise)

test("R5: an always approval does not cover flags that were not in the approved command", async () => {
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...HEADS), tail, tail, async (head, approvedTail, laterTail) => {
      const approved = [...head, ...approvedTail]
      const later = [...head, ...laterTail]
      const outcome = await afterAlways(approved, later)
      // Running without a prompt is only acceptable if no new flag was added.
      if (outcome === "runs") expect(flags(approved)).toEqual(expect.arrayContaining(flags(later)))
      // The approval must still be useful: the same command without any flags
      // runs without a prompt (e.g. approve `git checkout feature-x`, then run
      // `git checkout main`).
      if (flags(later).length === 0) expect(outcome).toBe("runs")
    }),
  )
})