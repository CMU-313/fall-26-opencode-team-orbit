import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import { Command } from "../../src/command"
import { TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(LayerNode.compile(Command.node), LayerNode.compile(CrossSpawnSpawner.node), testInstanceStoreLayer),
)

describe("helpMe", () => {
    it.instance("is registered as a built-in command", () =>
      Effect.gen(function* () {
        const command = yield* Command.Service
        const helpMe = yield* command.get(Command.Default.HELPME)
        expect(helpMe).toBeDefined()
      }),
    )

  it.instance("has a template", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const helpMe = yield* command.get(Command.Default.HELPME)
      expect(helpMe?.template).toBeDefined()
    }),
  )

  it.instance("has hints", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const helpMe = yield* command.get(Command.Default.HELPME)
      expect(helpMe?.hints).toBeDefined()
    }),
  )

  it.instance("has a description", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const helpMe = yield* command.get(Command.Default.HELPME)
      expect(helpMe?.description).toBeDefined()
    }),
  )

  it.instance("model instructed to never edit files", () =>
    Effect.gen(function* () {
        const command = yield* Command.Service
        const helpMe = yield* command.get(Command.Default.HELPME)
        const template = yield* Effect.promise(() =>
        Promise.resolve(helpMe?.template),
    )
        expect(template?.includes("This is a read only task. Do not create, edit, or delete any files. Only read files.")).toBe(true)
    }),
  )
})