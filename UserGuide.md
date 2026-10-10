# Team Orbit User Guide

This guide covers the features Team Orbit added to opencode, how to use and manually test each one, and where the automated tests for each feature live.

## `/orient` — summarize what a project is and does

**Owner:** Alex Jackson (issue [#7](https://github.com/CMU-313/fall-26-opencode-team-orbit/issues/7), PR [#12](https://github.com/CMU-313/fall-26-opencode-team-orbit/pull/12))

### What it does

`/orient` is a built-in slash command that gives a 3 to 5 sentence plain-language summary of the current project: what it is, the problem it solves, who it is for, the main technology, and one or two places a newcomer should look first. It is meant for a student opening an unfamiliar codebase for the first time.

The command runs under the `plan` agent, which denies every edit tool, so it can only read files and list directories. It never creates or modifies anything.

It reads sources in this order and stops as soon as it has enough:

1. `README*` at the repository root.
2. If there is no README, the root manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, or similar).
3. If there is still no clear picture, the top-level directory structure and key entrypoints. In that case the first sentence says plainly that the repo has no README and no manifest.

### How to use it

1. Start opencode in the project you want to learn about:
   ```sh
   bun dev .
   ```
2. Type `/or` and confirm `/orient` appears in the autocomplete list with the description "summarize what this project is and does".
3. Press Enter to run it. The session switches to Plan mode and the model replies with a short prose summary that names the files it relied on.
4. Optionally pass a focus after the command, for example `/orient focus on the testing setup`. The focus is honored if present and ignored if blank.

### How to user test it

| Scenario | Steps | Expected result |
| --- | --- | --- |
| Repo with a README | Run `/orient` in this repository. | 3 to 5 sentences of prose, no headings or bullets, citing the README. |
| Repo with a manifest but no README | Create an empty folder, run `bun init -y` inside it, delete any generated README, start opencode there, run `/orient`. | A summary inferred from `package.json` (name, scripts, dependencies). |
| Repo with neither | Create a folder with only `src/main.ts` and start opencode there, run `/orient`. | First sentence says there is no README or manifest, then a summary based on the directory structure. |
| Read-only | Run `git status` after any of the above. | Working tree is unchanged. |
| Focus argument | Run `/orient what is the CLI entrypoint`. | The summary addresses the focus while staying within 3 to 5 sentences. |
| Model failure | Run `/orient` with no provider configured or with an invalid API key. | The session shows opencode's standard provider error in the TUI instead of crashing. |

### Automated tests

Tests live in [`packages/opencode/test/command/orient.test.ts`](packages/opencode/test/command/orient.test.ts). Run them from the package directory:

```sh
cd packages/opencode
bun test test/command/orient.test.ts
```

Each test maps to an acceptance criterion from issue #7:

| Test | What it checks | Acceptance criterion |
| --- | --- | --- |
| is registered as a built-in command | `/orient` is in the command registry the TUI builds its help and autocomplete from. | Shows up in the help list |
| shows a description in the help list | The description string and `command` source are set. | Shows up in the help list |
| runs under the read-only plan agent | The command is bound to the `plan` agent. Combined with the existing `plan agent denies edits` test in `test/agent/agent.test.ts`, this proves the command cannot write files. | Does not create or modify files |
| points the prompt at the current repo | `${path}` is substituted with the real worktree path, using a real temporary git repo. | Summarizes the current project |
| asks for a 3 to 5 sentence summary | The prompt demands exactly 3 to 5 sentences about what the project is and does. | README repo returns a 3 to 5 sentence summary |
| reads the README first | README is step 1 of the investigation order. | README repo returns a summary |
| falls back to the manifest and then the directory structure | Steps 1, 2, 3 appear in order, the manifest list includes the common manifests, and the prompt tells the model to say when neither exists. | No-README repo still returns a summary |
| forbids creating, editing, or deleting files | The prompt itself restates the read-only rule and forbids running builds or tests. | Does not create or modify files |
| accepts an optional focus argument | `$ARGUMENTS` is the only hint, so the TUI offers the focus argument. | Usability |

### Why these tests are sufficient

The `/orient` feature consists of two pieces: a registry entry in `packages/opencode/src/command/index.ts` and a prompt template in `packages/opencode/src/command/template/orient.txt`. The registry entry is tested through the real `Command` service against a real test instance, not a mock, so registration, description, agent binding, path substitution, and argument hints are all verified exactly as the TUI sees them. The prompt template is tested for every behavioral guarantee in the acceptance criteria: output length and subject, the README then manifest then directory fallback order, and the read-only rule. The one guarantee the command delegates to existing code, that the `plan` agent denies edits, is already covered by the agent test suite on main.

What is not covered by automated tests is the quality of the model's actual summary, because that depends on a live provider call and is non-deterministic. That is covered by the manual scenarios in the user test table above. The original "clear error message when the model call fails" criterion is satisfied by opencode's existing provider error handling in the TUI rather than by command-specific code, which is why there is no custom error path to test here.

## `/btw` — ask a quick side question without interrupting the current task

**Owner:** Justin Ku (issue [#15](https://github.com/CMU-313/fall-26-opencode-team-orbit/issues/15), PR [#16](https://github.com/CMU-313/fall-26-opencode-team-orbit/pull/16))

### What it does

`/btw` is a built-in slash command that lets you ask a quick question about what the agent is currently doing, without that question or its answer becoming part of the main conversation. It is meant for a student watching opencode work through a task who wants to understand a step without derailing the task itself.

The command runs in a separate child session, not the main one. It receives the last 30 messages of the main conversation as read-only context and replies in a few plain-language sentences grounded in what that conversation says, naming the specific files, functions, and steps mentioned there. If the main conversation does not contain enough to answer, it says so in one sentence.

Like `/orient`, it runs under the `plan` agent, which denies every edit tool. It can read files to clarify an answer but never creates, modifies, or deletes anything, and it does not run commands or offer to do further work.

Because the question and answer live only in the child session, the main session's history is untouched and the agent's context on its next turn contains no trace of them.

### How to use it

1. Start opencode in any project:
   ```sh
   bun dev .
   ```
2. Give the agent a task so there is a conversation to ask about, for example `refactor the cache`.
3. Type `/bt` and confirm `/btw` appears in the autocomplete list with the description "ask a quick side question without interrupting the current task".
4. Type your question after the command, for example `/btw why are we touching the cache key path?`, and press Enter. The question is required.
5. The answer appears in a dialog titled "btw". Dismiss it and the main conversation continues as if nothing happened.

### How to user test it

| Scenario | Steps | Expected result |
| --- | --- | --- |
| Side question mid-task | Start a task, then run `/btw <question>` about it while the agent is still working. | A dialog titled "btw" shows a few sentences answering the question, citing files or steps from the main conversation. |
| Main conversation stays clean | After the dialog closes and the task finishes, scroll through the main chat. | Neither the question nor the answer appears in the main conversation. |
| Side session is visible | Open the session list. | A child session titled `btw: <question> (@btw subagent)` exists under the main session. |
| Not enough context | Run `/btw` with a question unrelated to the current task in a fresh session. | The answer says in one sentence that the conversation does not contain enough to answer. |
| Read-only | Run `git status` after any of the above. | Working tree is unchanged. |
| Model failure | Run `/btw <question>` with no provider configured or with an invalid API key. | A toast reading `btw failed: ...` appears instead of a crash, and the main session is unaffected. |

### Automated tests

Tests live in [`packages/opencode/test/command/btw.test.ts`](packages/opencode/test/command/btw.test.ts). Run them from the package directory:

```sh
cd packages/opencode
bun test test/command/btw.test.ts
```

Each test maps to an acceptance criterion from issue #15:

| Test | What it checks | Acceptance criterion |
| --- | --- | --- |
| is registered as a built-in command | `/btw` is in the command registry the TUI builds its help and autocomplete from. | Shows up in the help list |
| shows a description in the help list | The description string is set to "ask a quick side question without interrupting the current task". | Shows up in the help list |
| takes the question as $ARGUMENTS and forbids edits | `$ARGUMENTS` is the argument hint, and the prompt template references the `<main_conversation>` block and restates the no-create, no-edit, no-delete rule. | Takes a question; does not create or modify files |
| answers in a side session without touching main convo | While a main run is held mid-flight against a fake model, `/btw` returns an answer from a different session ID; the model request contains both the question and the main task; once the main run finishes its history is exactly the original user message and assistant reply; and the next main turn's model input contains neither the question nor the answer. | Answers the question; main conversation and agent context are unaffected |
| cannot create a file | The fake model issues a `write` tool call for a new file during `/btw`; the directory listing is unchanged afterwards. | Does not create or modify files |
| cannot overwrite a file | Same as above with a `write` to the existing `opencode.json`; its contents are unchanged. | Does not create or modify files |

### Why these tests are sufficient

The `/btw` feature consists of four pieces: a registry entry in `packages/opencode/src/command/index.ts`, a prompt template in `packages/opencode/src/command/template/btw.txt`, the side-session branch in `packages/opencode/src/session/prompt.ts`, and the dialog that displays the answer in `packages/tui/src/component/prompt/index.tsx`. The first three are tested end to end through the real `Command`, `Session`, and `SessionPrompt` services against a fake model server. The registration tests verify the command exactly as the TUI sees it. The side-session test is the core guarantee of the feature and exercises the realistic case: the main run is deliberately held open while `/btw` runs, so the test proves the answer arrives concurrently, is grounded in the main conversation, and leaves no trace in either the stored history or the agent's next-turn context. The two file tests go beyond checking that the `plan` agent is bound: they have the model actually attempt a write and confirm the filesystem is untouched.