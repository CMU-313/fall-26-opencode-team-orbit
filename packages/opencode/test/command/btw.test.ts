import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Fiber } from "effect"
import { readdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { Command } from "../../src/command"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      Command.node,
      CrossSpawnSpawner.node,
      Session.node,
      SessionPrompt.node,
      SessionProjector.node,
      LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
    ]),
  ),
)

const QUESTION = "why are we touching the cache key path?"
const ANSWER = "Because the hello step reads it."

// Mock environment: a main session wired to a fake model
const setup = Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const llm = yield* TestLLMServer
  const config = path.join(directory, "opencode.json")
  const json = JSON.stringify({ $schema: "https://opencode.ai/config.json", ...testProviderConfig(llm.url) })
  yield* Effect.promise(() => writeFile(config, json))
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "main" })
  return {
    llm,
    chat,
    btw: (question: string) =>
      prompt.command({ sessionID: chat.id, command: Command.Default.BTW, arguments: question }),
    say: (text: string) => prompt.prompt({ sessionID: chat.id, agent: "build", parts: [{ type: "text", text }] }),
    history: sessions.messages({ sessionID: chat.id }).pipe(
      Effect.map((msgs) =>
        msgs.map((m) => `${m.info.role}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("")}`),
      ),
    ),
    files: Effect.promise(async () => [await readdir(directory), await readFile(config, "utf8")]),
  }
})

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

  it.instance(
    "answers in a side session without touching main convo",
    () =>
      Effect.gen(function* () {
        const { llm, chat, btw, say, history } = yield* setup
        const gate = Promise.withResolvers<void>()
        yield* llm.hold("main done", gate.promise)
        const main = yield* say("refactor the cache").pipe(Effect.forkChild)
        yield* llm.wait(1)

        // answers while the main run is still waiting on the model
        yield* llm.text(ANSWER)
        const result = yield* btw(QUESTION)
        expect(result.parts).toContainEqual(expect.objectContaining({ type: "text", text: ANSWER }))
        expect(result.info.sessionID).not.toBe(chat.id)
        const sent = JSON.stringify((yield* llm.inputs).at(-1))
        expect(sent).toContain(QUESTION)
        expect(sent).toContain("refactor the cache")

        // when the main run finishes its history has no trace of the side question
        gate.resolve()
        yield* Fiber.join(main)
        expect(yield* history).toEqual(["user: refactor the cache", "assistant: main done"])

        // nor does the agent's context on the next turn
        yield* llm.text("next reply")
        yield* say("continue")
        const next = JSON.stringify((yield* llm.inputs).at(-1))
        expect(next).not.toContain(QUESTION)
        expect(next).not.toContain(ANSWER)
      }),
    30_000,
  )

  for (const [name, filePath] of [
    ["create a file", "new.txt"],
    ["overwrite a file", "opencode.json"],
  ] as const) {
    it.instance(
      `cannot ${name}`,
      () =>
        Effect.gen(function* () {
          const { llm, btw, files } = yield* setup
          const before = yield* files
          yield* llm.tool("write", { filePath, content: "x" })
          yield* llm.text(ANSWER)
          yield* btw(QUESTION)
          expect(yield* files).toEqual(before)
        }),
      30_000,
    )
  }
})