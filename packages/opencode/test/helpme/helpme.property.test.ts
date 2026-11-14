import { describe, it, test, expect } from 'bun:test';
import fc from 'fast-check';
import { executeHelpMe, type CommandItem, type HelpMeInput } from '../../src/command/index.ts';

fc.configureGlobal({ seed: 42 })

// --- Arbitrary Generators ---
const commandArbitrary: fc.Arbitrary<CommandItem> = fc.record({
  name: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  type: fc.constantFrom("read", "write", "delete"),
  description: fc.stringMatching(/^[a-zA-Z0-9]*$/),
  sourceFile: fc.stringMatching(/^[a-zA-Z0-9]{2,}$/),
  isNew: fc.boolean(),
});

// Unique command names prevent duplicate-name collisions during sort checks
const uniqueCommandsArbitrary = (minLength = 0, maxLength = 15) =>
  fc.uniqueArray(commandArbitrary, {
    minLength,
    maxLength,
    selector: (cmd) => cmd.name,
  });

const helpMeInputArbitrary: fc.Arbitrary<HelpMeInput> = fc.record({
  commands: uniqueCommandsArbitrary(0, 15),
  sortBy: fc.constantFrom("alphabetical", "type"),
  reportFeedback: fc.option(fc.string(), { nil: undefined }),
});

describe("helpme command property-based tests", () => {
  
  // R1: Model/Oracle Property (Feedback header - Positive & Negative & null/undefined)
  it("R1: should render exact feedback header iff reportFeedback is truthy and always return success: true", () => {
    fc.assert(
      fc.property(helpMeInputArbitrary, fc.string({ minLength: 1 }), (input, feedback) => {
        // 1. Truthy feedback
        const withFeedback = executeHelpMe({ ...input, reportFeedback: feedback });
        expect(withFeedback.success).toBe(true);
        expect(withFeedback.output).toContain("⚠️  Report Button Triggered!");
        expect(withFeedback.output).toContain(`🔄 Rectifying system output with feedback: ${feedback}`);

        // 2. Empty string feedback (kills mutants that change `if (input.reportFeedback)` to `!== undefined`)
        const withEmptyFeedback = executeHelpMe({ ...input, reportFeedback: "" });
        expect(withEmptyFeedback.success).toBe(true);
        expect(withEmptyFeedback.output).not.toContain("⚠️  Report Button Triggered!");
        expect(withEmptyFeedback.output).not.toContain("🔄 Rectifying system output with feedback:");

        // 3. Undefined / null feedback
        const withoutFeedback = executeHelpMe({ ...input, reportFeedback: null });
        expect(withoutFeedback.output).not.toContain("⚠️  Report Button Triggered!");
      })
    );
  });

  // R2: Metamorphic & Oracle Property (Strict Sorting Order)
   it("R2: should sort commands strictly by alphabetical name or by type", () => {
    fc.assert(
      fc.property(uniqueCommandsArbitrary(2, 15), (commands) => {
        // 1. Alphabetical sort
        const resAlpha = executeHelpMe({ commands, sortBy: "alphabetical" });
        const renderedAlpha = [...resAlpha.output.matchAll(/^• \/([a-zA-Z0-9]+)/gm)].map((m) => m[1]);
        const expectedAlpha = [...commands]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => c.name);

        expect(renderedAlpha).toEqual(expectedAlpha);

        // 2. Type sort (handles ties consistently with JS sort)
        const resType = executeHelpMe({ commands, sortBy: "type" });
        const renderedType = [...resType.output.matchAll(/^• \/([a-zA-Z0-9]+)/gm)].map((m) => m[1]);
        const expectedType = [...commands]
          .sort((a, b) => a.type.localeCompare(b.type))
          .map((c) => c.name);

        expect(renderedType).toEqual(expectedType);
      })
    );
  });

  // new test after running stryker Boundary Property (Checking for System Operations Headers, Built-in Lines & Trailing Whitespace Trimming)
   it("should always render exact system headers and trim trailing blank lines", () => {
    fc.assert(
      fc.property(helpMeInputArbitrary, (input) => {
        const result = executeHelpMe(input);

        expect(result.output).toContain("--- System Operations ---");
        expect(result.output).toContain("📦 [Basic] helpme - Explains basic and custom command operations workspace-wide.");
        expect(result.output).toContain("📦 [Basic] version - Outputs current build constraints.");
        expect(result.output).toContain("--- Registered Tool Commands ---");

        // Kills mutants that remove `lines.pop()` or `.trim()`
        expect(result.output.endsWith("\n")).toBe(false);
        expect(result.output.startsWith("\n")).toBe(false);
      })
    );
  });

  // R4: Structural Invariant (exact command block formatting with Type, Description, and Source lines)
  it("R4: should format every command block with exact Type, Description, and Source lines", () => {
    fc.assert(
      fc.property(uniqueCommandsArbitrary(1, 15), (commands) => {
        const result = executeHelpMe({ commands, sortBy: "alphabetical" });

        for (const cmd of commands) {
          const newTag = cmd.isNew ? " 🔥 [NEW]" : "";
          const expectedBlock = [
            `• /${cmd.name}${newTag}`,
            `  Type: ${cmd.type}`,
            `  Description: ${cmd.description}`,
            `  Source: ${cmd.sourceFile}`,
          ].join("\n");

          expect(result.output).toContain(expectedBlock);
        }
      })
    );
  });


  // R5: Conditional Flag Property (Both isNew: true and isNew: false)
  it("R5: should attach ' 🔥 [NEW]' iff isNew is true and not mutate the input array", () => {
    fc.assert(
      fc.property(uniqueCommandsArbitrary(1, 15), (commands) => {
        const snapshot = structuredClone(commands);
        const result = executeHelpMe({ commands, sortBy: "alphabetical" });

        // Kills mutant that removes `[...input.commands]` shallow copy
        expect(commands).toEqual(snapshot);

        const lines = result.output.split("\n");
        for (const cmd of commands) {
          const headerLine = lines.find((l) => l.startsWith(`• /${cmd.name}`));
          expect(headerLine).toBeDefined();

          if (cmd.isNew) {
            expect(headerLine).toBe(`• /${cmd.name} 🔥 [NEW]`);
          } else {
            expect(headerLine).toBe(`• /${cmd.name}`);
          }
        }
      })
    );
  });
});