import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { Command } from "../../src/command"
import { testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(LayerNode.compile(Command.node), LayerNode.compile(CrossSpawnSpawner.node), testInstanceStoreLayer),
)

describe("/btw command", () => {
  it.instance("is registered as a built-in command", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const names = (yield* command.list()).map((item) => item.name)
      expect(names).toContain(Command.Default.BTW)
    }),
  )

  it.instance("shows a description in the help list", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const btw = yield* command.get(Command.Default.BTW)
      expect(btw?.description).toBe("ask a quick side question without interrupting the current task")
    }),
  )

  it.instance("takes the question as $ARGUMENTS and forbids edits", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const btw = yield* command.get(Command.Default.BTW)
      const template = yield* Effect.promise(async () => btw!.template)
      expect(btw?.hints).toContain("$ARGUMENTS")
      expect(template).toContain("<main_conversation>")
      expect(template).toContain("do not create, edit, or delete")
    }),
  )
})