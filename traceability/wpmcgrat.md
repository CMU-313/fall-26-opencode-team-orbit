# Traceability: Billy McGrath (wpmcgrat)

**Target feature:** helpme, index.ts

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | S-7 “Some kind of report tool that could let you note that the output was not what the code does and something is wrong” | Add a report button to alert the model when a mistake is made and attempt to rectify it | A report button is present and will allow you to rerun the command with additional feedback provided to the model to correct its errors | No | Model/oracle | test 1 |
| R2 | C-2: “I think organizing the commands based on what they are being used for would be useful.” | Sort the results of the command to organize them by type or function | Results are listed either in alphabetical order, general type of command such as ones that only can read files vs write vs delete, or their scope and this can be controlled with additional keywords built on top of the base command | No | metamorphic | test 2 |
| R3 | O-2: “maybe it could explain basic functions in addition to custom functions like comprehensive descriptions of general stuff” | Explain basic functions too | All basic, non-custom functions are listed accurately in the results of the command consistently regardless of how many times you rerun the command | no | Invariant | not tested, instead a line was added to the normal function to point users towards the normal /help command for this purpose |
| R4 | O-6: “It could maybe have a source popup with the code to show what the command is doing and where it says that could be quite useful” | Show the source file of a function | When the command is run each of the commands listed also show what files their implementation comes from and what files it affects | no | Invariant | test 3 |
| R5 | S-3: “It should show the new slash command and maybe it would be helpful to note it as a new slash command and what it does in some special way” | Mark new slash commands as new | In the output of the command it will display a highlight and the word “new” on the most recently created command since it was last run | no | metamorphic |test 4 |

Properties written or suggested by opencode or another AI tool: All properties themselves were written by me but the property based tests for R1, R2, R4, and R5 were written with help from gemini

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|