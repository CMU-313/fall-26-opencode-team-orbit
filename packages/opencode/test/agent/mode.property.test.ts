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

const agentLayer = () =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  )

const it = testEffect(agentLayer())
const load = <A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) => Agent.Service.use(fn)

const WRITE_TOOLS = ["edit", "write", "patch", "bash"] as const
const tool = fc.constantFrom(...WRITE_TOOLS)
const target = fc.string({ minLength: 1 })

afterEach(async () => {
  await disposeAllInstances()
})

// R2: In Ask mode, write and command tools are denied.
// Kind: invariant (every tool and target is denied).
// Generator: every write/command tool with arbitrary targets, including
// empty-looking and punctuation-heavy strings.
it.instance("R2: Ask mode denies every write and command tool for any target", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    expect(ask).toBeDefined()
    fc.assert(
      fc.property(tool, target, (t, pattern) => {
        expect(Permission.evaluate(t, pattern, ask!.permission).action).toBe("deny")
      }),
    )
  }),
)

// R2: Ask mode's write/command decision does not depend on the target.
// Kind: metamorphic (changing the target leaves the decision unchanged).
// Generator: same tool set and arbitrary targets, compared against the "*" target.
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

// R2 (as written in P3): Ask mode requires approval before reads.
// Kind: invariant. EXPECTED TO FAIL against the current code: Ask inherits
// read "*": "allow" from defaults. Triage this one (see below).
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

// R1 is about the status bar and is not tested here. See below.

// Plan mode: edits are denied except markdown files under .opencode/plans/.
// Kind: invariant.
// Generator: arbitrary paths, filtered to exclude the allowed pattern so the
// property checks the denial rule.
it.instance("Plan mode denies edits outside .opencode/plans/*.md", () =>
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

// Auto mode: edits, writes, patches, and commands are allowed.
// Kind: invariant. Generator: same tool set, arbitrary targets.
it.instance("Auto mode allows every write and command tool for any target", () =>
  Effect.gen(function* () {
    const auto = yield* load((svc) => svc.get("auto"))
    fc.assert(
      fc.property(tool, target, (t, pattern) => {
        expect(Permission.evaluate(t, pattern, auto!.permission).action).toBe("allow")
      }),
    )
  }),
)