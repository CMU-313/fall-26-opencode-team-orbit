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




# `toggle-slash-command` — summarize what a project is and does

**Owner:** Vicky Yan (issue [#6](https://github.com/CMU-313/fall-26-opencode-team-orbit/issues/6), PR [#12](https://github.com/CMU-313/fall-26-opencode-team-orbit/pull/17))

### What it does

The issue consisted of a desire for the student to interact with the agent in different ways, including different methods to work on a task (plan, a hands-off approach; ask, where they only answer your questions; and auto, where the agent helps you build). I created new slash command modes for Plan, Auto, and Ask that help answer questions and assist student learning in different ways. The changes have been tested and work accordingly.


1. Toggle /plan, /auto, or /ask depending on which tool you want to use in the Opencode prompt editor.


### How to use it

1. Start opencode in the project you want to learn about:
   ```sh
   bun dev .
   ```
2. Type `/ask`, `/auto`, or `/plan`. Confirm that whichever one you typed in appears in the autocomplete list with its respective descriptions.
3. Press Enter to run it. The session switches to mode that you chose to use.

### How to user test it

Tests live in [`packages/opencode/test/agent/agent.test.ts`](packages/opencode/test/agent/agent.test.ts). Run them from the package directory:

```sh
cd packages/opencode
bun test test/command/agent.test.ts
```

Each test maps to an acceptance criterion from issue #6:




### Why these tests are sufficient

The toggle-slash PR adds two new primary agents (ask, auto) alongside the existing plan/build, and wires them up as slash commands (/plan, /ask, /auto) in the command palette.

Tests that were added to packages/opencode/test/agent/agent.test.ts cover:

Agent definition correctness — each new agent (ask, auto) has the expected mode: "primary", native: true, and permission defaults (ask denies edit/bash/write/patch; auto allows all of them).

Subagent delegation permission — ask denies delegating to the general subagent, auto allows it, matching the acceptance criteria that auto behaves with full autonomy while ask stays read-only/conversational.

Config integration — default_agent can be set to ask or auto and is respected.

This covers the acceptance criteria from planning: a user can toggle between Plan, Ask, and Auto modes via slash command, each mode enforces the correct tool permissions, and the modes integrate with existing config/default-agent mechanisms.

What is not covered by automated tests is the quality of the model's actual summary, because that depends on a live provider call and is non-deterministic. That is covered by the manual scenarios in the user test table above. The original "clear error message when the model call fails" criterion is satisfied by opencode's existing provider error handling in the TUI rather than by command-specific code, which is why there is no custom error path to test here.
