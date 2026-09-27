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

describe("/important command", () => {
  it.instance("is registered as a built-in command", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const names = (yield* command.list()).map((item) => item.name)
      expect(names).toContain(Command.Default.IMPORTANT)
    }),
  )

  it.instance("shows a description in the help list", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const important = yield* command.get(Command.Default.IMPORTANT)
      expect(important?.description).toBe("show the important files in this repo")
    }),
  )

  it.instance("runs under the read-only plan agent", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const important = yield* command.get(Command.Default.IMPORTANT)
      expect(important?.agent).toBe("plan")
    }),
  )

  it.instance(
    "points the prompt at the current repo",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const command = yield* Command.Service
        const important = yield* command.get(Command.Default.IMPORTANT)
        const template = yield* Effect.promise(async () => important!.template)
        expect(template).toContain(test.directory)
        expect(template).not.toContain("${path}")
      }),
    { git: true },
  )

  it.instance("asks for important files and files to ignore without editing anything", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const important = yield* command.get(Command.Default.IMPORTANT)
      const template = yield* Effect.promise(async () => important!.template)
      expect(template).toContain("Do not create, edit, or delete any files")
      expect(template).toContain("Important files")
      expect(template).toContain("Safe to ignore")
    }),
  )

  it.instance("accepts an optional focus argument", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const important = yield* command.get(Command.Default.IMPORTANT)
      expect(important?.hints).toContain("$ARGUMENTS")
    }),
  )
})
