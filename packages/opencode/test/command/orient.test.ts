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

// Acceptance criteria from issue #7:
// 1. /orient shows up in the help list
// 2. a repo with a README gets a 3 to 5 sentence summary of the project's purpose
// 3. a repo with no README still gets a summary from the manifest and directory structure
// 4. the command does not create or modify any files
describe("/orient command", () => {
  it.instance("is registered as a built-in command", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const names = (yield* command.list()).map((item) => item.name)
      expect(names).toContain(Command.Default.ORIENT)
    }),
  )

  it.instance("shows a description in the help list", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      expect(orient?.description).toBe("summarize what this project is and does")
      expect(orient?.source).toBe("command")
    }),
  )

  it.instance("runs under the read-only plan agent so it cannot edit files", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      expect(orient?.agent).toBe("plan")
    }),
  )

  it.instance(
    "points the prompt at the current repo",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const command = yield* Command.Service
        const orient = yield* command.get(Command.Default.ORIENT)
        const template = yield* Effect.promise(async () => orient!.template)
        expect(template).toContain(test.directory)
        expect(template).not.toContain("${path}")
      }),
    { git: true },
  )

  it.instance("asks for a 3 to 5 sentence summary of the project's purpose", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      const template = yield* Effect.promise(async () => orient!.template)
      expect(template).toContain("3 to 5 sentence summary")
      expect(template).toContain("what this project is and what it does")
      expect(template).toContain("Exactly 3 to 5 sentences of prose")
    }),
  )

  it.instance("reads the README first", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      const template = yield* Effect.promise(async () => orient!.template)
      expect(template).toContain("1. `README*` at the repository root")
    }),
  )

  it.instance("falls back to the manifest and then the directory structure when there is no README", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      const template = yield* Effect.promise(async () => orient!.template)
      const readme = template.indexOf("1. `README*`")
      const manifest = template.indexOf("2. If there is no README")
      const structure = template.indexOf("3. If there is still no clear picture")
      expect(readme).toBeGreaterThan(-1)
      expect(manifest).toBeGreaterThan(readme)
      expect(structure).toBeGreaterThan(manifest)
      for (const file of ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]) {
        expect(template).toContain(file)
      }
      expect(template).toContain("list the top-level directories")
      expect(template).toContain("If the repository has no README and no manifest, say so plainly")
    }),
  )

  it.instance("forbids creating, editing, or deleting files", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      const template = yield* Effect.promise(async () => orient!.template)
      expect(template).toContain("This is a read-only task")
      expect(template).toContain("Do not create, edit, or delete any files")
      expect(template).toContain("Do not run the build or tests")
    }),
  )

  it.instance("accepts an optional focus argument", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const orient = yield* command.get(Command.Default.ORIENT)
      expect(orient?.hints).toEqual(["$ARGUMENTS"])
    }),
  )
})
