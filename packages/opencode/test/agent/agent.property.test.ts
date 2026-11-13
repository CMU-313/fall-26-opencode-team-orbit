import { afterEach, expect } from "bun:test"
import fc from "fast-check"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Global } from "@opencode-ai/core/global"
import path from "path"

fc.configureGlobal({ seed: 42 })

const agentLayer = () =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  )

const it = testEffect(agentLayer())
const load = <A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) => Agent.Service.use(fn)

const DENIED_TOOLS = ["edit", "write", "patch"] as const
const deniedTool = fc.constantFrom(...DENIED_TOOLS)
const tool = fc.constantFrom("edit", "write", "patch", "bash") as fc.Arbitrary<string>
const target = fc.string({ minLength: 1 })

afterEach(async () => {
  await disposeAllInstances()
})

// R2: In Ask mode, edit tools are denied and commands require approval.
// Kind: invariant (every edit tool and target is denied).
// Generator: every edit tool with arbitrary targets, including
// empty-looking and punctuation-heavy strings.
it.instance("R2: Ask mode denies write tools for any target", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    fc.assert(
      fc.property(fc.constantFrom("write", "patch"), target, (t, pattern) => {
        expect(Permission.evaluate(t, pattern, ask!.permission).action).toBe("deny")
      }),
    )
  }),
)

// R2: Ask mode's write/command decision does not depend on the target.
// Kind: metamorphic (changing the target leaves the decision unchanged).
// Generator: write and command tools with arbitrary targets, compared against the "*" target.
it.instance("R2: Ask mode decision for write tools ignores the target", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    fc.assert(
      fc.property(tool, target, (t, pattern) => {
        const base = Permission.evaluate(t, "*", ask!.permission).action
        expect(Permission.evaluate(t, pattern, ask!.permission).action).toBe(base)
      }),
    )
  }),
)

// R2: Ask mode requires approval before reads.
// Kind: invariant.
// Generator: arbitrary read targets.
it.instance("R2: Ask mode requires approval before reads", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    fc.assert(
      fc.property(target, (p) => {
        expect(Permission.evaluate("read", p, ask!.permission).action).toBe("ask")
      }),
    )
  }),
)

// R2: Ask mode asks before running any shell command.
// Kind: invariant (kills the bash survivor where the bash rule is removed).
// Generator: arbitrary command strings.
it.instance("R2: Ask mode asks before any bash command", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    fc.assert(
      fc.property(fc.string(), (cmd) => {
        expect(Permission.evaluate("bash", cmd, ask!.permission).action).toBe("ask")
      }),
    )
  }),
)

// R1 is about the status bar and is not tested here. See below.

// R3: Plan mode denies edits outside .opencode/plans/*.md.
// Kind: invariant.
// Generator: arbitrary paths, filtered to exclude the allowed pattern so the
// property checks the denial rule.
it.instance("R3: Plan mode denies edits outside .opencode/plans/*.md", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    fc.assert(
      fc.property(
        target.filter((p) => !/^\.opencode\/plans\/[^/]*\.md$/.test(p)),
        (p) => {
          expect(Permission.evaluate("edit", p, plan!.permission).action).toBe("deny")
        },
      ),
    )
  }),
)

// R4: Plan mode allows plan files with any valid name under .opencode/plans/.
// Kind: invariant (kills H4, where the *.md allow rule is removed).
// Generator: random safe filenames, so the property tests many names, not one example.
it.instance("R4: Plan mode allows any .md file under .opencode/plans/", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9_-]{1,20}$/), (name) => {
        expect(Permission.evaluate("edit", `.opencode/plans/${name}.md`, plan!.permission).action).toBe("allow")
      }),
    )
  }),
)

// R4: Plan mode allows external-directory access to plan files.
// Kind: invariant (kills the external_directory survivor).
// Generator: random safe filenames placed in the global plans folder.
it.instance("R4: Plan mode allows external access to plan files", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9_-]{1,20}$/), (name) => {
        const p = path.join(Global.Path.data, "plans", name)
        expect(Permission.evaluate("external_directory", p, plan!.permission).action).toBe("allow")
      }),
    )
  }),
)

// R5: Auto mode allows every write and command tool for any target.
// Kind: invariant. Generator: same tool set, arbitrary targets.
it.instance("R5: Auto mode allows every write and command tool for any target", () =>
  Effect.gen(function* () {
    const auto = yield* load((svc) => svc.get("auto"))
    fc.assert(
      fc.property(tool, target, (t, pattern) => {
        expect(Permission.evaluate(t, pattern, auto!.permission).action).toBe("allow")
      }),
    )
  }),
)

// R5: Auto mode allows subagent delegation (task.general).
// Kind: invariant (kills H3, where task.general is changed to deny).
// Generator: arbitrary targets for the task tool.
it.instance("R5: Auto mode allows delegation to subagents", () =>
  Effect.gen(function* () {
    const auto = yield* load((svc) => svc.get("auto"))
    fc.assert(
      fc.property(target, (p) => {
        expect(Permission.evaluate("task", p, auto!.permission).action).toBe("allow")
      }),
    )
  }),
)