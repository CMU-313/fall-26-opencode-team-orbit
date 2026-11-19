# Traceability: /orient (Alex Jackson, alexjack)

**Target feature:** `/orient`, the built-in slash command that summarizes what a project is and does, with an optional focus (for example `/orient focus on the test setup`).

**Files:** `packages/opencode/src/command/orient.ts` (permission rules, file selection, and the "Files read" block), `packages/opencode/src/command/index.ts` (registration), `packages/opencode/src/command/template/orient.txt` (prompt), `packages/opencode/src/agent/agent.ts` (the `orient` agent), `packages/opencode/src/session/prompt.ts` (hands the chosen files to the model).

The summary text is written by the model, and CI cannot call a model. My properties therefore check the deterministic shell around the model call: which permissions `/orient` runs under (R1 to R3) and which files it chooses and tells the model to cite (R4 to R7). They show that the code enforces each requirement for every generated input. They do not show that the model always follows the instructions it is given.

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | S-6, C-4, O-4: "never edit any of the files"; "no destructive changes" | /orient runs under a permission set in which editing is denied for every path, and no user permission config can loosen that. | For any path (including `.opencode/plans/*.md`, dotfiles, and paths outside the repo) and any user permission rules, the `edit` permission, which the edit, write, and apply_patch tools all use, evaluates to `deny` under /orient's agent. Added in P5: so does `task`, for every subagent name, and the agent checked is the one the command registry binds /orient to. | Yes (criteria extended in P5) | No path can be edited, whatever the user's config says (invariant) | `orient.property.test.ts`: "R1 (invariant)", "R1, R2 (wiring)" | H1; H7 after the wiring property was re-pointed at the command's agent. Stryker: all 12 mutants of `permission` and the `UNSAFE` list, including the blanked `task` rule once R1 also checks `task`. |
| R2 | C-8, O-11, O-12: "git status is fine... I'd say no to all git commands" | Under /orient, the only shell commands that run without a permission prompt are `git status` and `git log` with plain arguments. Install and test commands never run on their own. | For any command, the `bash` permission evaluates to `allow` only if the command is `git status` or `git log` and contains no redirect, pipe, chained command, substitution, or `--output`. `npm install`, `npm test`, and the same commands with any arguments appended evaluate to `ask`. | Yes | The rules agree with a read-only-git oracle written from the requirement (model/oracle); appending arguments to an install or test command never makes it run unasked (metamorphic) | `orient.property.test.ts`: "R2 (model/oracle)", "R2 (metamorphic)", "R1, R2 (wiring)" | H2 (also fails the wiring and R3 properties). Stryker: the `UNSAFE` tokens, the `git status *` and `git log *` rules and the `*: ask` default, shared with R1 and R3. |
| R3 | C-5, O-6, O-7: "it should ask for permission before it does this" | Every shell command that is not read-only git (R2) goes through opencode's permission prompt instead of running, and a user rule that denies a command still denies it under /orient. | With the user rule `{"bash": {"npm *": "deny"}}`, `npm install` evaluates to `deny`, `git status` still evaluates to `allow`, and every other command evaluates exactly as it did without the rule. No command outside R2 ever evaluates to `allow`. | Yes | A user deny rule turns ask into deny for that tool and leaves every other decision unchanged (metamorphic) | `orient.property.test.ts`: "R3 (metamorphic)" | H3 (survived one unseeded run until the generator always names the denied tool). Stryker: the merge-order and rule mutants in `permission`. |
| R4 | S-18, C-18, O-21: "I wouldn't trust a summary that doesn't cite any files" | /orient computes the "Files read" line itself and tells the model to end its answer with it. The line names at least one path whenever the repository has a readable file, lists each path once, and every path exists in the repository and is not generated or vendored. | For any repository listing and any focus: every selected path is in the listing and outside `node_modules`, `.git`, `dist`, and `build`; no path repeats; the selection is non-empty when the listing has a real file; and the last line of the block sent to the model is `Files read: ` followed by exactly the selected paths. Added in P5: without a focus the files read are the root README, the manifests and the entry points (at most six of them), each on its own line of the block; with none of those, the first three files. | Yes (criteria extended in P5) | The Files read line names real, existing, non-generated files (invariant) | `orient.property.test.ts`: "R4 (invariant)" | H5 after focuses that name a base file were added; H6 also fails R4 after strengthening. Stryker: 50 of 53 mutants in `select`, all 8 in `footer`, 9 of 19 in `brief`. |
| R5 | S-13, S-15, C-14: "pointed me to two totally different files, that would be unacceptable" | The set of files /orient reads is chosen by the command's own file-selection logic, not by the model, so two runs on an unchanged repo read the same files. | For any repository listing and any focus, selecting from the same files listed in a different order, or listed twice, gives the identical selection. | Acceptance criteria only | The selection does not depend on listing order or duplicates (metamorphic) | `orient.property.test.ts`: "R5 (metamorphic)" | H4. Stryker: the de-duplication, sort and backslash mutants at the top of `select`. |
| R6 | S-10, C-12, O-25: "focus on tests to only return test files" | With a focus, /orient reads the same base files as without one, plus files whose path matches a focus word. Every added file matches the focus, and the output still ends with the "Files read" list. | For any repository and a focus such as "focus on the test setup": the selection starts with the no-focus selection; every additional file is a test file; at least one test file is selected when the repo has one; `src/latest.ts` and `node_modules/tests/index.js` are never added; and the block still ends with the `Files read:` line. | Yes | A focus adds matching files and never drops a base file (metamorphic) | `orient.property.test.ts`: "R6 (metamorphic)" | H5 (through R4's uniqueness check). Stryker: 20 of 21 mutants in `mentions`, the focus-word filter, the plural rule and the six-file focus cap. |
| R7 | S-20, C-19, O-22, O-23: "it should say there isn't a README" | /orient decides whether a root README exists. When none does, it tells the model to open with "No README was found in this repository.", and it still selects at least one file to read whenever the repository has any. | For any repository listing, the instruction to open with "No README was found in this repository." is present exactly when the listing has no README at the root (a `docs/README.md` does not count). With no README and no manifest, the selection is still non-empty if the repo has a real file. | Yes | The no-README notice appears exactly when there is no root README (invariant) | `orient.property.test.ts`: "R7 (invariant)" | H6. Stryker: the README pattern and all eight manifest names. |

Properties written or suggested by opencode or another AI tool: all nine properties (R1 to R7) and their generators, and their Project 5 strengthening. Claude Code was used for assistance. The first `R6` property in `orient.agent.property.test.ts` was written by opencode (deepseek-flash, plan agent) and is kept verbatim as the agent failure case below; the strengthened version under it is mine.

## Requirement review (Step 1)

Every P3 requirement was written as "run /orient, then inspect what happened." That needs a live model call, which CI does not have, and the model samples its output, so the code cannot guarantee what a single run does. For each requirement I kept what the interviewees asked for and moved the checkable part into code that /orient runs before and around the model call.

- **R1, R2, R3: revised (can't be checked, and R2 conflicted with R1).** The model decides which tools to attempt. The code decides which attempts are denied, asked about, or allowed. The revised requirements are stated on that decision.
- **R4, R7: revised (can't be checked).** The original criteria inspect model-written output. The revised versions make /orient compute the "Files read" line and the no-README notice itself.
- **R5: requirement kept, acceptance criteria revised (can't be checked).** The wording already said the command, not the model, chooses the files. Only the two-run acceptance test changed.
- **R6: revised (conflict between interviewees).** C-12 expected a focus to read "the same files"; S-10 expected "only" test files.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | /orient makes no changes to the working tree. It never creates, modifies, or deletes files in the repository. Acceptance: start from a clean `git status`, run /orient, and `git status --porcelain` is empty with no new untracked files. | /orient runs under a permission set in which editing is denied for every path, and no user permission config can loosen that. | Can't be checked as written: the acceptance test needs a real model run, and a clean tree after one run does not show that the next run cannot write. What S-6, C-4, and O-4 needed is that /orient is unable to change files, so the requirement now states that every edit is denied before it happens. That holds for every path and every config, which a property can check. |
| R2 | /orient runs no shell commands other than read-only git commands (git status, git log), and never runs install or test commands on its own. Acceptance: stub the shell runner, run /orient on a repo with a test script, and the recorded commands contain only git status / git log. | Under /orient, the only shell commands that run without a permission prompt are `git status` and `git log` with plain arguments. Install and test commands never run on their own. | Two problems. It can't be checked as written, because which commands get attempted is the model's choice; the code controls which ones run without asking. It also conflicted with R1: "read-only git commands" as written allowed `git log > README.md` and `git log --output=notes.txt`, which write files. The revision defines read-only so that a redirect, pipe, chained command, substitution, or `--output` sends the command back to a prompt. C-8 and O-11 still get `git status` without a prompt; O-12 still gets "no" to everything else by default. |
| R3 | If /orient would ever need to execute a non-read-only command, it requests permission through opencode's permission system instead of running it. Acceptance: deny `npm *`, run /orient with a prompt that would tempt an install, and the permission layer records an ask/deny event with no npm process spawned. | Every shell command that is not read-only git (R2) goes through opencode's permission prompt instead of running, and a user rule that denies a command still denies it under /orient. | Can't be checked as written: "would ever need to" depends on what the model decides, and "ask/deny" allowed either outcome, so a test could not fail. The revision fixes one outcome per case: `ask` by default (C-5, O-6, O-7 all said it should ask), and `deny` when the user has a deny rule. |
| R4 | The output ends with a "Files read" list naming at least one repository path, and every path listed exists in the repository. Acceptance: run /orient on the team repo; the output has a line starting with "Files read:" and each path resolves to an existing file. | /orient computes the "Files read" line itself and tells the model to end its answer with it. The line names at least one path whenever the repository has a readable file, lists each path once, and every path exists in the repository and is not generated or vendored. | Can't be checked as written: the output is model-written, so a test on it needs a model and can still pass or fail by chance. S-18, C-18, and O-21 wanted citations they can open and trust. The line is now built by code from the files /orient actually selected, so it cannot name a file that does not exist. "Whenever the repository has a readable file" covers the empty-repo case the original left open. |
| R5 | (Requirement unchanged.) Acceptance: run /orient twice on the same commit; the two "Files read" lists are identical as sets. | (Requirement unchanged.) Acceptance: for any repository listing, the same files listed in a different order, or twice, give the identical selection. | The original acceptance test needs two model runs. Since the selection is now code, the thing that could make two runs differ is the order the filesystem lists files in, so the criterion tests exactly that. |
| R6 | When a focus argument is given, the "Files read" list includes files matching the focus (e.g. test files for "test setup"), and the output still ends with the "Files read" list. | With a focus, /orient reads the same base files as without one, plus files whose path matches a focus word. Every added file matches the focus, and the output still ends with the "Files read" list. | Conflict between interviewees. C-12 said a focus "should look through the same files"; S-10 said a tests focus should "only return test files, not other kinds of code." The original wording ("includes") did not say which one wins. O-25 asked for the focus to "relate it back to the bigger picture," so the revision keeps the base files (C-12, O-25) and requires that everything added by the focus matches it (S-10). |
| R7 | On a repo with no README and no manifest, /orient still produces a summary, and the first line of the output states that no README was found. Acceptance: in a temp directory with only `main.py`, output is non-empty, its first line contains "No README", and `main.py` appears in "Files read". | /orient decides whether a root README exists. When none does, it tells the model to open with "No README was found in this repository.", and it still selects at least one file to read whenever the repository has any. | Can't be checked as written: "the first line of the output" is model-written. The code now makes the decision (is there a README at the root?) and gives the model the exact sentence to open with. The notice applies whenever the README is missing, not only when the manifest is missing too, because C-11 and O-22 asked to be told about a missing README without that extra condition. |

## Run, triage, and fix (Step 3)

| Property | First run | Triage | Fix |
|---|---|---|---|
| R1, R2 (wiring), edit half | Failed against the agent /orient was bound to on `main` (`plan`). Seed 1184584890. Counterexample: `.opencode/plans/orient.md`, where `edit` evaluated to `allow`. | Code bug. The plan agent may write its own plan notes under `.opencode/plans/`, which is inside the repository, so /orient could create a file there. R1 says it never can. | /orient now runs under its own `orient` agent (`Orient.permission` in `src/command/orient.ts`, registered in `src/agent/agent.ts`). Its edit rule is `deny` for every path and is merged after the user's rules. |
| R1, R2 (wiring), bash half | Failed against `plan`. Seed 1859798975. Shrunk counterexample: `npm install`, where `bash` evaluated to `allow`, expected `ask`. | Code bug. The plan agent inherits the default `"*": "allow"`, so every shell command ran without a prompt. Only the prompt text told the model not to. | The `orient` agent asks for every shell command by default, allows `git status` and `git log`, and asks again when the command contains a redirect, pipe, chained command, substitution, or `--output`. |
| R4, R5, R6, R7 | No code to run against: on `main` the model chose which files to read. | Requirement not yet implemented. | Added `Orient.select` and `Orient.brief` and wired them into the command in `src/session/prompt.ts`, so /orient lists the repository, chooses the files, and appends the file list, the no-README notice, and the `Files read:` line to the prompt. |
| R1 (invariant), R2 (model/oracle), R2 (metamorphic), R3 (metamorphic), R4, R5, R6, R7 | Passed on the first run against the new code. | None needed. | None. |
| Wiring of R4 to R7 (found by hand, not by a property) | The properties passed, but running the listing on the team repo returned zero files, so /orient would have told the model there was no README in every repository. | Code bug. The single glob pattern I used to list three directory levels matched nothing. The properties could not see it because they test the selection, not the directory listing that feeds it. | Listed each level with its own pattern, and strengthened the example test in `prompt.test.ts` so it writes a README and a test file into a real directory and checks that both reach the model. |

After the fixes all 9 properties pass, 100 generated cases each.

Added in P5: the properties caught a real regression on the day they landed. Merging PR #25 made `Permission.fromConfig` sort the rules inside one ruleset by specificity, so /orient's `git status *` allow rule moved after its `*>*` ask rule and `git status > out.txt` evaluated to `allow`. Three properties failed with that counterexample ("R1, R2 (wiring)", "R2 (model/oracle)", "R3 (metamorphic)"). Fix: `Orient.permission` now merges the unsafe-token rules as a ruleset of their own, after the allow rules. H1 and H3 were regenerated against the fixed code and all seven hand-written mutants are still killed. The Stryker reports and mutant numbers above come from commit 0a67312, before this fix; the fix adds one object literal to the permission block and changes nothing the properties check. Two example tests cover the wiring that properties cannot reach: `orient.test.ts` ("runs under the read-only orient agent") and `prompt.test.ts` ("/orient hands the model the files it chose and runs under the orient agent").

## Hand-written mutants

Patches are in `mutants/alexjack/H1.patch` to `H7.patch`. Each applies to the current branch with `git apply mutants/alexjack/H<n>.patch` from the repo root; run `bun test test/command/orient.property.test.ts` from `packages/opencode`, then `git checkout -- packages/opencode/src/command`. The predictions were written down before any patch was run. Each mutant was then run three times against the unseeded Project 4 properties, once with the seed fixed to 42, and once more after the strengthening described in the next section.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1 | `orient.ts`: the `edit: deny, task: deny` rules are merged before the user's rules instead of after them, so a user config with `edit: allow` wins (the kind of "user config should take precedence" refactor another agent would get) | "R1 (invariant)": its user-rule generator draws `edit` and `*` allow rules | Killed by R1 (invariant) in all three unseeded runs and with seed 42. |
| H2 | R2 | `orient.ts`: `--output` dropped from the `UNSAFE` list, so `git log --output=notes.txt` runs unasked. Plausible because every other entry is a shell metacharacter and `--output` is git's own flag | "R2 (model/oracle)", through the disguised-command generator, which pairs each read-only git command with a writing suffix | Killed in every run, but by different properties each time: the wiring property 3 of 3, R3 2 of 3, the R2 oracle only 2 of 3, because the mixed `command` generator draws `--output` in only about one case in sixty. With seed 42: wiring and R2 oracle. After strengthening all three fail. |
| H3 | R3 | `orient.ts`: /orient's bash rules are merged after the user's rules, so a user rule `npm *: deny` is overridden by the agent's `*: ask` (the same "agent rules win" ordering the edit rule uses) | "R3 (metamorphic)": a command naming the denied tool should evaluate to `deny` and evaluates to `ask` | Killed in two of three unseeded runs and **survived the third**: that run drew no command starting with the chosen tool. Killed with seed 42. After strengthening (the property now always builds a command that names the denied tool) killed. |
| H4 | R4 | `orient.ts`: the listing is no longer de-duplicated (`[...new Set(...)]` replaced by a plain `map`), so a path listed twice is read twice and appears twice in the Files read line | R4 says "lists each path once", but its repository generator never lists a path twice, so I predicted "R5 (metamorphic)", whose double-listing case would see it | Killed by R5 only, in all runs; R4 never noticed, as predicted. |
| H5 | R6 (breaks R4) | `orient.ts`: the focus matches no longer exclude the base files (`!base.includes(file) &&` removed), so `/orient focus on the readme` lists README.md twice | R4's "each path once" check should, but I predicted it would **survive**: no generated focus names a file /orient reads anyway | Survived one unseeded run and was killed by R4 in the other two, each time through the same corner: a repository whose only file was `tests/conftest.py`, so the fallback made it a base file and the test focus added it again. **Survived with seed 42.** After adding focuses such as "focus on the readme" and "package.json" it is killed by R4 and R6. |
| H6 | R7 | `orient.ts`: the README pattern loses its start anchor (`/readme(\.[a-z0-9]+)?$/i`), so `docs/README.md` counts as the README and the no-README notice is skipped | "R7 (invariant)", because `docs/README.md` is in the ordinary-files pool | Killed by R7 in every run. After strengthening R4 fails too, because `docs/README.md` turns up among the base files. |
| H7 | R1 (wiring) | `command/index.ts`: /orient is bound back to the `plan` agent, which may write `.opencode/plans/*.md` inside the repository. This is what a merge-conflict resolution against `main` would produce, and it is the bug the P4 wiring property first found | None. The wiring property looked the agent up as `Orient.AGENT` instead of asking which agent the command is bound to, so I predicted it would **survive** every property and be caught only by the example test in `orient.test.ts` | **Survived every run of the properties** (the example test in `orient.test.ts` does fail). After re-pointing the wiring property at `Command.Service.get("orient").agent` it is killed by "R1, R2 (wiring)". |

Two things I did not predict: how much the result depended on the draw (H3 and H5 flipped between runs before the seed was fixed), and that H6 and H5 end up killed by R4 rather than by the property written for their requirement once R4 states which files are read.

## Stryker comparison

Configuration: `packages/opencode/stryker.alexjack.config.json` runs `bun test test/command/orient.property.test.ts` through the command runner and mutates only `src/command/orient.ts`, the module the properties call. Stryker 10.1.1 generated 158 mutants. Every run below used fast-check seed 42, fixed with `fc.configureGlobal({ seed: 42 })` at the top of the property file. The committed report `mutants/alexjack/mutation.html` is the final run; `mutants/alexjack/mutation-before.html` is the run against the Project 4 properties.

| Run | Detected | Survived | Score as Stryker reports it | Score with the 2 equivalent mutants excluded |
|---|---|---|---|---|
| Project 4 properties (seed 42) | 104 | 54 | 65.82% | 104 of 156, 66.67% |
| After strengthening | 136 (132 killed, 4 timed out, which Stryker counts as detected) | 22 | 86.08% | 136 of 156, 87.18% |

The four timeouts are permission-rule mutants (#20 to #23: the unsafe-token rules emptied, their pattern blanked, the edit/task object emptied, an action blanked) that fail almost every generated case, so three properties spend the per-mutant time budget shrinking counterexamples; they are detected, not surviving.

**Which hand-written mutants did Stryker never generate, and why?** H1 and H3 reorder the arguments of `Permission.merge`; Stryker has no operator that swaps arguments, so it never sees ordering bugs between rulesets. H4 removes the `new Set` around the listing; Stryker's method mutator drops `.filter`, `.sort` and `.slice` calls but not a spread of a constructor. H5 deletes one conjunct of `!base.includes(file) && mentions(file, words)`; Stryker's nearest mutant removes the `!`, which also stops matching non-base files and so was killed by R6 for a different reason than the duplicate it introduces. H7 is in `command/index.ts`, outside the mutated file, and is precisely the kind of wiring bug that mutating the module under test cannot reach. H2 and H6 Stryker did generate in spirit: it blanks `"--output"` to `""`, which makes the pattern `**` and asks for everything (a louder bug than dropping the token), and it removes the README pattern's anchors one at a time, with the `^` removal killed just as H6 was.

**Which Stryker survivors would I never have thought of, and are they plausible?** `task: "deny"` replaced by `task: ""` (#24) is not a bug anyone writes, but it showed that nothing tested the task rule at all, and deleting that rule is plausible. Removing the backslash normalisation (#63) is plausible for a developer on macOS and no generated path had a backslash. The three mutants of the `Files read: none` branch (#133, #135, #138, one of them `>` to `>=`) survived because the generator produced an empty repository with probability about 1 in 3200; off-by-one on an emptiness check is a real bug class. `known.length > 0 ? known : files.slice(0, 3)` replaced by `false ? ...` (#75) reads the first three files in sort order and ignores the README it found, and nothing in R1 to R7 said the README must be read, only that /orient decides whether one exists. The five entry-point regex mutants (#39 to #43, for example a single-character extension) are typo-shaped and plausible. The eight remaining stop-word mutants (dropping "please" from the ignored list) are plausible edits with almost no effect.

**What does each approach find that the other does not?** The hand-written mutants found cross-file and ordering bugs (H1, H3, H7) and semantic removals aimed at one requirement's blind spot (H4's duplicates, H5's duplicate-through-focus), none of which Stryker's operator set can express. Stryker was exhaustive about every literal, operator and regex, which exposed generator gaps I had not noticed: no empty repository, no Windows paths, half the manifest types missing from the pool, no near-miss filenames such as `README.md.bak` or `app.js.map`, and an untested `task` rule. Fixing the seed also made Stryker a flakiness detector: two plural-rule mutants that earlier runs killed by luck survived a later run until R6 asserted that every matching test file is added rather than "at least one". What Stryker cannot do is tell a plausible bug from `"Stryker was here!"`, and ten of its 22 remaining survivors are the wording of the prompt block.

### Strengthening

All survivors were addressed by changing generators or assertions in `orient.property.test.ts`; no example tests were added. The changes, with the mutants they kill:

- R1 also checks that `task` is denied for every subagent name (#24), and the wiring property resolves the agent through `Command.Service` instead of by its constant name (H7).
- The R2 oracle draws the disguised commands on their own, so every unsafe token is tried with every read-only git command every run (makes H2 a deterministic kill by R2 itself); R3 always builds a command that names the denied tool (H3).
- Generators: all eight manifest names (#35 to #38); seven test files and a cap assertion (#93); `README.md.bak` (#26), `app.js.map` (#40), `src/utils/index.ts` (#39) and three docs files named after filler words (#45, #50, #52, #53, #79, #86, #88) in the ordinary pool; one repository in ten with nothing recognisable (#74, #75, #76, #78) and one in ten with no readable file (#133, #135, #138); focuses that name a base file (H5) and filler-only focuses.
- R4 asserts that without a focus the README, manifests and entry points are what is read, at most six of them, that the first three files are read when none exist, and that each selected file is listed on its own line of the block (#39 to #43, #70, #71, #73, #75, #78, #145, #147, #148, #149).
- R5 lists the same files with backslashes (#63). R6 checks that filler words around a focus change nothing and that the number of files added equals the number of matching test files outside the base, up to six (#125, #127 and the stop-word mutants above).

Before the strengthening, R4 had the most survivors (about 27 of the 54, counting the selection, footer and brief code it covers), and the weakness was the assertion: R4 only required that each path exist and not be generated, so a selection of the wrong files passed.

### Equivalent mutants (2)

- #84: `input.focus.toLowerCase().match(/[a-z0-9]+/g) ?? []` with the fallback replaced by `["Stryker was here"]`. The fallback is reached only when the focus contains no letter or digit. The replacement word contains spaces, a path part is split on everything that is not a letter or digit and so never contains a space, and `words` is used only through `mentions`, so the selection cannot change.
- #112: `split(/[^a-z0-9]+/)` replaced by `split(/[^a-z0-9]/)`. The only difference is empty strings between consecutive separators, as in `__tests__`. An empty part can equal only a word that is `""` or `"s"`, and focus words are at least three characters long, so no comparison in `mentions` changes.

### Survivors that are not equivalent and not killed (20)

- Eight stop words (#46 to #50, #54 to #56: "focus", "the", "and", "for", "with", "this", "that", "please") each blanked from `IGNORED_WORDS`. Observable only when a path segment or name part equals that word. R6 says "a focus word" and does not define which words of the typed text count, so a property that killed these would have to copy the stop-word list from the module. I killed the three with a realistic filename ("about", "how", "what" via `docs/about.md`, `docs/how-to.md`, `docs/whats-new.md`) and left these.
- #89 and #90 remove the three-letter minimum (`word.length > 2` to `true` or `>= 2`), so "go", "md" or "ts" become focus words. R6 does not say, and S-11 ("focus on the back end, say Go or Rust") suggests the mutant may be closer to what that interviewee wanted than the code is. This is a requirement question, recorded in the retrospective, not something to settle with a test that copies the `> 2`.
- Ten mutants of the prompt wording in `brief` (#141, #142, #143, #144, #146, #150, #151, #152, #153, #156): the heading, the "read exactly these files" sentence, the "(no readable files)" placeholder, blank lines, and the closing instruction. The model sees different text, so they are not equivalent, but no requirement fixes that wording, and a test that did would be the prompt pasted into the test. The two facts the requirements do fix, the no-README sentence (R7) and the Files read line (R4), are asserted and their mutants are killed.

## Agent failure case

None of the Project 4 properties came from opencode (they were written with Claude Code, as disclosed above), so on 2026-11-12 I asked opencode to write one for R6 and ran the mutants against it. The run used the branch's own build (`bun run dev run --agent plan --model deepseek/deepseek-flash` in `packages/opencode`); the Groq models on this account reject the plan agent's prompt as larger than the 8,000 tokens-per-minute limit, and the Copilot credential is not licensed, so DeepSeek was the provider that answered. The full transcript is in `mutants/alexjack/agent-transcript.txt`; the property is kept verbatim as the first test in `packages/opencode/test/command/orient.agent.property.test.ts`.

**Prompt**

> I am writing property-based tests for the /orient slash command in this repo (packages/opencode). The code is in src/command/orient.ts. Orient.select({ files, focus }) takes the list of repository-relative file paths and the optional focus text the user typed after /orient, and returns { files, readme, manifest } where files is the list of paths /orient will read. Orient.brief(selection) returns the text block appended to the prompt, which ends with a "Files read: ..." line.
> 
> Write one fast-check property test for this requirement:
> 
> R6: With a focus, /orient reads the same base files as without one, plus files whose path matches a focus word. Every added file matches the focus, and the output still ends with the "Files read" list.
> 
> Use bun:test (import { test, expect } from "bun:test") and fast-check (import fc from "fast-check"), importing Orient from "../../src/command/orient". Include the generators you use. Do not edit or create any files, just print the complete test code in your reply and briefly explain what it checks.

**Response** (opencode read `src/command/orient.ts` first, then answered)

```ts
import { test, expect } from "bun:test"
import fc from "fast-check"
import { Orient } from "../../src/command/orient"

const IGNORED = new Set([
  "focus", "the", "and", "for", "with", "about", "how", "what", "this", "that", "please",
])

// A word-like token that survives /orient's focus-word filter.
const token = fc.stringMatching(/^[a-z]{4,8}$/).filter((word) => !IGNORED.has(word))

// Generator: build a pool of tokens, then derive file paths and a focus from it so
// that focus words often appear in file paths (exercising the "added file" branch).
const scenario = fc.uniqueArray(token, { minLength: 1, maxLength: 8 }).chain((pool) => {
  const part = fc.constantFrom(...pool)
  const file = fc
    .array(part, { minLength: 1, maxLength: 4 })
    .map((segments) => `${segments.join("/")}.ts`)
  const focus = fc
    .array(part, { minLength: 0, maxLength: 3 })
    .map((words) => words.join(" "))
  return fc.tuple(fc.array(file, { minLength: 0, maxLength: 12 }), focus)
})

const focusWords = (focus: string) =>
  (focus.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length > 2 && !IGNORED.has(word),
  )

const pathParts = (file: string) => file.toLowerCase().split(/[^a-z0-9]+/)

const matchesFocus = (file: string, words: string[]) =>
  words.some((word) =>
    pathParts(file).some(
      (part) => part === word || part === `${word}s` || `${part}s` === word,
    ),
  )

test("R6: focus keeps the base files, adds only matching files, and keeps the Files read footer", () => {
  fc.assert(
    fc.property(scenario, ([files, focus]) => {
      const plain = Orient.select({ files, focus: "" })
      const focused = Orient.select({ files, focus })

      // The base selection (no focus) is preserved as a prefix.
      expect(focused.files.slice(0, plain.files.length)).toEqual(plain.files)

      // Every file added by the focus matches one of the focus words.
      const added = focused.files.slice(plain.files.length)
      const words = focusWords(focus)
      expect(added.filter((file) => !matchesFocus(file, words))).toEqual([])

      // The brief still ends with the exact "Files read" list.
      const text = Orient.brief(focused)
      expect(text.split("\n").at(-1)).toBe(Orient.footer(focused))
      expect(text.endsWith(Orient.footer(focused))).toBe(true)
    }),
  )
})
```

> It checks three things for arbitrary file lists and focus text: the no-focus files are an exact prefix of the focused selection, every file appended by the focus matches a filtered focus word using the same path-segment/plural rules as `mentions`, and `brief` still ends with the `Files read: ...` footer. The `token` generator and the chained `scenario` generator keep focus words tied to path tokens so the "added file" branch is actually exercised, while still allowing empty focuses and unmatched files.

**The mutants it let survive.** The property passes on the unmutated code and still passes with H5 applied (focus matches no longer exclude the base files, so `/orient focus on the readme` lists README.md twice), with H4 applied (duplicates in the listing are read twice), and with H6 applied (a nested README counts as the README). H5 is the one that matters: it targets R6, the requirement the property was written for.

**Why the property was too weak.** Three reasons, one of each kind the handout lists.

- An always-passing oracle. opencode read `orient.ts` before answering and copied its matching code into the test: the `IGNORED` set, the `word.length > 2` filter and the `part === word || part === word + "s" || part + "s" === word` rule are the module's own `mentions` and word filter, line for line. "Every added file matches a focus word" therefore agrees with the module by construction. It would even agree with H5, because a base file listed a second time does match the focus.
- A missing assertion. R6 says the focus reads the base files "plus files whose path matches". The property checks the prefix and that added files match, but never that an added file is new, that nothing is listed twice, or that a focus which matches something adds something, so a mutant that disables focus entirely would also pass.
- A generator that never reaches the boundaries. Paths are built from whole tokens joined with `/` and `.ts`, so a focus word never appears inside a longer name (`latest.ts` for "test"), and there is never a README or manifest, so the base files are always the first-three fallback.

**Strengthened version.** The second test in the same file, "R6 (strengthened)". It keeps opencode's token-pool idea but also generates `la<word>.ts` names, repeated paths and an optional README and manifest; its oracle is the requirement's wording (a focus word is a whole path segment or name part) rather than a copy of the module; and it asserts that each added file is new, that no file is listed twice, and that a focus which matches a non-base file adds at least one. Evidence, from `bun test test/command/orient.agent.property.test.ts` with each patch applied:

```
unmutated:  2 pass, 0 fail
H4 applied: original passes; strengthened fails
            Counterexample: [[[["fpxeiv/lafpxeiv.ts","fpxeiv/lafpxeiv.ts"],[]],""]]
H5 applied: original passes; strengthened fails
            Counterexample: [[[["biin.ts"],[]],"biin"]]
```

In the H5 counterexample the repository has one file, `biin.ts`, which is the fallback base file; the focus "biin" matches it, the mutant lists it twice, and the strengthened property's "an added file is new" check fails.

## Known limits

- /orient lists files three directory levels deep, so a focus cannot bring in files nested deeper than that.
- Without a focus /orient reads at most six of the README, manifest and entry-point files, and at most three files when it recognises none; a focus adds at most six more. These limits are asserted by the R4 and R6 properties since P5 but come from the code, not from an interview.
- The properties check what /orient allows and what it tells the model. Whether the model then opens with the notice and ends with the `Files read:` line is checked by hand.
