# Traceability: Vicky Yan (vyy)

**Target feature:** Slash mode toggles (/auto, /ask, /plan). Files:
packages/opencode/src/agent/agents.ts (permission rulesets per mode), plus the
command handler and status bar code (to be located).

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-6, O-9, S-8, S-9 | The status bar always shows the active mode name. | After /plan, the status bar shows "plan". After /auto, it shows "auto". | Yes (replaced P3 template row) | Invariant | Not yet written. Needs UI state location. |
| R2 | S-3, O-4, S-2 | In Ask mode, reading files and running commands require user approval. Writes and edits are denied. | In Ask mode, `read` and `bash` evaluate to `ask` for any target. `edit`, `write`, and `patch` evaluate to `deny`. | Yes ("harmless" removed; `read` and `bash` changed from allow/deny to ask) | Invariant, Metamorphic | `mode.property.test.ts`: "R2: ..." tests |
| R3 | S-4, O-5, C-3, O-8 | Switching Ask → Auto → Ask restores Ask's permissions. Conversation history persists across the switch. | After Ask → Auto → Ask, `edit` evaluates to `deny` and `bash` evaluates to `ask`. Earlier messages remain in session context. | Yes (outcome made specific; history check split out) | Round-trip | Not yet written. Permission part can be tested via `Agent.Service`; history part needs the session code. |
| R4 | S-5, O-6, C-4 | Re-issuing the current mode does not change the mode or plan, and shows a notice. | In Plan mode, /plan leaves the mode as Plan, shows "Already in plan mode", and the plan is unchanged. | No | Invariant | Not yet written. Needs command handler location. |
| R5 | C-5, S-6, O-7 | Mode commands are case-insensitive. Unrecognized input never switches mode and shows a suggestion when a close match exists. Trailing whitespace is not stripped. | "/Plan" switches to Plan. "/pln" does not switch and shows "Did you mean /plan?". "/plan " does not switch. | Yes (trailing space decided: not stripped; confirm with staff) | Metamorphic, Invariant | Not yet written. Needs command parser location. |

Properties written or suggested by opencode or another AI tool: none

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | (Template example: command rule precedence) | The status bar always shows the active mode name. | The P3 row was never filled in. Replaced with a requirement from C-6, O-9, S-8. |
| R2 | Reading files and harmless commands require permission. | In Ask mode, reading files and running commands require approval. Writes and edits are denied. | "Harmless" can't be checked. S-3 and O-4 say reads need approval. Code fix: `read` and `bash` were not set to `ask` in agents.ts. |
| R3 | Ask → Auto → Ask resets write permissions; context persists. | Switching Ask → Auto → Ask restores Ask's permissions. History persists. | "Refuses or asks" allowed either outcome, so the test couldn't fail. Outcome is now one specific result. |
| R5 | Trailing-space handling unresolved. | Trailing whitespace is not stripped: "/plan " does not switch. | S-6 says a trailing space should not behave normally. Still needs staff confirmation. |

## Code fix log (Step 3)

| Property | First run | Triage | Fix |
|---|---|---|---|
| R2: Ask mode requires approval before reads | Fail (read inherited "allow" from defaults) | Code bug | Set `read` and `bash` to `"ask"` in Ask's `Permission.fromConfig` block in agents.ts. |
| R2: Ask write/command denial | Expected to fail after the fix if the test still expects `bash: deny` | Wrong test | Updated to check `bash` and `read` for `ask`, and `edit`, `write`, `patch` for `deny`. |


## Hand-written mutants

| ID | Requirement targeted | Change | Predicted killer | Actual result | Notes
| H1 | R1 | Ask `read` changed from "ask" to "allow" | R2: Ask requires approval before reads | Killed | Killed | Failed the non-plan edit path property (expect(...).toBe("deny"), received "ask")

| H2 | R2 | Ask `bash` changed from "ask" to "deny" | Survived (only edit checked) | Killed | R2 property failed on write with target " ", received "allow". Deleting the write rule let it fall through to the "*": "allow" default.

| H3 | R3 | Ask `edit` adds `"*.md": "allow"` | Denies every edit, write, and patch | survived (no property checks task in auto mode)| All 5 properties passed. The auto-mode property covers write and command tools but not task.general. This is a gap to fill in the strengthening step.

| H4 | R4 | Plan [".opencode", "plans", "*.md"] allow rule removed | Plan-mode property asserting .opencode/plans/x.md is "allow" | Survived | All 5 properties passed. The plan-mode property only checks the deny side, so removing the *.md allow rule went unnoticed. Gap for the strengthening step.

| H5 | R5 | Plan Permission.merge puts user before defaults | Plan-mode property asserting edits outside .opencode/plans/.md are denied, killed | Killed | The existing plan-mode property checks the deny outcome directly, so any change that lets defaults override plan’s edit deny is visible to it.



## Stryker comparison

**Setup:** Stryker run with `stryker.vyy.config.json`. `mutate` is limited to `src/agent/agent.ts` (the `plan`, `ask`, and `auto` blocks). Test command: `bun test test/agent/agent.property.test.ts`. Seed: `42` (`fc.configureGlobal({ seed: 42 })`). Stryker generated 59 mutants.

**Score:** Stryker reports **40.68%**: 24 of 59 detected (17 killed, 7 timed out, 35 survived). Timeouts count as detected. Score with equivalent mutants excluded: 24 / (59 − E), where E is the number of equivalent mutants argued below: [fill in].

**Run history:** Three runs on the same mutant set gave 88.14% (5 killed, 47 timeouts, 7 survived), 62.71% (9 killed, 28 timeouts, 22 survived), and 40.68% (17 killed, 7 timeouts, 35 survived). The mutant count stayed at 59, but the split changed a lot between runs. I report the latest run because it matches the current committed code.

### Which hand-written mutants did Stryker never generate?

Stryker didn't generate any of my five hand-written mutants exactly as I wrote them. It made similar changes, but not the same ones:

- **H1 (plan edit `deny` → `ask`):** Stryker only replaces text with an empty string. It never swapped `deny` for `ask`.
- **H2 (delete ask's `write` block):** Stryker empties a whole block to `{}`. It never removes just one rule.
- **H3 (auto `task` `allow` → `deny`):** Stryker blanked the value instead (`general: ""`). That mutant survived, like mine did, so both found the same gap.
- **H4 (remove `*.md` from the plans path):** Stryker blanked the `*.md` part instead of removing the whole entry. That mutant also survived, like mine did.
- **H5 (swap `defaults` and `user`):** Stryker doesn't change the order of function arguments. This was the only mutant that needed me to understand how the permission rules override each other.

In short, Stryker changes individual values. My mutants change which rule takes priority.

### Which Stryker survivors would I never have thought of?

- **`bash: {}` in ask mode (line 199) and `"*": ""` (line 200):** Removing the ask rule for bash falls back to the `"*": "allow"` default, so shell commands run without asking. This is a plausible bug in a permissions refactor, and no property catches it.
- **`write: {}` in auto mode (line 235):** Falls back to defaults. Less serious, since auto mode is meant to allow writes, but it survived.
- **`external_directory: {}` in plan mode (line 168):** Removes the allow rule for plan files outside the repo. A developer could plausibly drop this block while refactoring, and plan mode would lose access to its own plan files.
- **`path.join(Global.Path.data, "", "*")` (line 169):** A typo-level change to the external-directory path that changes which directories plan mode can reach.

Some survivors are not real developer bugs. The `name`, `description`, `mode`, and `native` string and boolean changes (for example lines 179, 180, 183, 184, 211, 212, 216, 217, 241, 242) don't change permissions, so the property suite can't observe them. `name` and `description` are visible in the UI, so I'd argue equivalence only with care, and only for the permission-behavior properties the suite is meant to check.

### What each approach finds that the other doesn't

**Hand-written mutants** found the merge-order problem (H5) and the deny fall-through from deleting a rule (H2). Both depend on understanding `Permission.merge` and how `defaults` interacts with each mode, which Stryker can't infer from literal changes. Each one also maps to a specific requirement row.

**Stryker** covered breadth. It mutated every string and object literal in all three modes, including the external-directory entries I hadn't listed, and it found the `bash: {}`, `write: {}`, and `external_directory: {}` gaps I hadn't thought to mutate.

**Agreement:** Both approaches flagged the same two weaknesses. Auto-mode `task.general` (H3, and Stryker's `general: ""` at line 224) and the plan-mode `*.md` allow rule (H4, and Stryker's `""` segment at line 173) both survived under both methods. Two independent methods pointing at the same gap makes those gaps more credible.

### Equivalent mutants

I looked for equivalent mutants in this run and didn’t find a clear one. The path.join changes look harmless, but removing "plans" widens the allowed path, so they do change behavior. Removing the bash, write, and external_directory rules changes what the agent can do. The "" values might be equivalent, but only if unknown actions are treated like deny, which I haven’t checked. The name, description, mode, and native changes are the only real candidates, but name and description show up in the UI, so they’re visible. Unless I find that nothing reads these fields, I’m reporting E = 0, so the score with equivalents excluded is 24 / 59 = 40.68%.

## Strengthening



### Equivalent mutants
The write: {} mutant in auto mode removes an explicit "*": "allow" rule for the write tool. The defaults block already allows every tool with "*": "allow", and user config is merged last, so it still wins. Every write decision stays "allow", so no test can observe the change. This is the only survivor I classify as equivalent. Everything else stays non-equivalent.



## Agent failure case

**Agent:** Opencode

**Transcript:** it.instance("R2: Ask mode denies every edit, write, and patch tool for any target", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    expect(ask).toBeDefined()
    fc.assert(
      fc.property(deniedTool, target, (t, pattern) => {
        expect(Permission.evaluate(t, pattern, ask!.permission).action).toBe("deny")
      }),
    )
  }),
)

**Property:** "R2: Ask mode decision for write tools ignores the target" (metamorphic test)

**Mutant:** Ask mode's `write` rule changed from `"*": "deny"` to `"*": "allow"`.

**Why it's weak:** The test compares each target's answer to the answer for `"*"`. If the rule is wrong, every target gets the same wrong answer, so the two sides match and the test passes. It checks that answers are consistent but not if they're correct

**Result on this property alone:** Survived on the test.

**Result on the full suite:** Survived ✓ R2: Ask mode denies every edit, write, and patch tool for any target

**Strengthened version:**

```ts
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
```
Result: ✓ R2: Ask mode denies every edit, write, and patch tool for any target