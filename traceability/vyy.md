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
| H1 | R2 | Ask `read` changed from "ask" to "allow" | R2: Ask requires approval before reads | Killed | Killed | Failed the non-plan edit path property (expect(...).toBe("deny"), received "ask")

| H2 | R2 | Ask `bash` changed from "ask" to "deny" | None | (run and record) |

| H3 | R2 | Ask `edit` adds `"*.md": "allow"` | Denies every edit, write, and patch | (run and record) |

| H4 | R2 | Ask `write` rule removed (falls back to allow) | Denies every edit, write, and patch | (run and record) |

| H5 | R2 | Defaults `"*.env": "ask"` removed (equivalent for Ask) | None | (run and record) |

No mutants yet for R1, R3 (switch-handler part), R4, or R5: the code that implements them isn't located.