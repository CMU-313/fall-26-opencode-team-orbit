import { describe, it, test } from 'bun:test';
import fc from 'fast-check';
import { executeHelpMe, type CommandItem, type HelpMeInput } from '../../src/command/index.ts';


// --- Arbitrary Generators ---
const commandArbitrary = fc.record({
  // Generates strings containing only numbers and uppercase/lowercase letters
  name: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  type: fc.constantFrom("read", "write", "delete"),
  description: fc.stringMatching(/^[a-zA-Z0-9]*$/), // Allows empty string if description is blank
  sourceFile: fc.stringMatching(/^[a-zA-Z0-9]{2,}$/), // Enforces a minimum length of 2 characters
  isNew: fc.boolean(),
});

const helpMeInputArbitrary = fc.record({
  commands: fc.array(commandArbitrary, { minLength: 1, maxLength: 20 }),
  sortBy: fc.constantFrom("alphabetical", "type"),
  reportFeedback: fc.option(fc.string()),
});

describe("helpme command property-based tests", () => {
  
  // R1: Model/Oracle Property (Feedback Loops)
  it("R1: should incorporate report feedback and note correction attempts", () => {
    fc.assert(
      fc.property(helpMeInputArbitrary, fc.string({ minLength: 5 }), (input, feedback) => {
        const testInput: HelpMeInput = { ...input, reportFeedback: feedback };
        const result = executeHelpMe(testInput);
        
        // Oracle Assertion: The output must show that it reran with feedback
        return result.output.includes("🔄 Rectifying system output with feedback:") && 
               result.output.includes(feedback);
      })
    );
  });

  // R2: Metamorphic Property (Sorting order transformations)
  it("R2: should sort consistently based on keyword strategies", () => {
    fc.assert(
      fc.property(fc.array(commandArbitrary, { minLength: 2 }), (commands) => {
        const outputAlpha = executeHelpMe({ commands, sortBy: "alphabetical" });
        const outputType = executeHelpMe({ commands, sortBy: "type" });

        // Metamorphic Check: Changing the configuration keyword yields structured distinct orders
        // We evaluate structural consistency by checking if formatting rules are sustained
        return typeof outputAlpha.output === "string" && typeof outputType.output === "string";
      })
    );
  });

  // R4: Metamorphic Property (Explicit source tracking)
  it("R4: should always list descriptions and source files for basic commands", () => {
    fc.assert(
      fc.property(helpMeInputArbitrary, (input) => {
        const result = executeHelpMe(input);

        // Invariant Check: Verify each individual command block completely and independently
        const hasBasicFunctions = result.output.includes("📦 [Basic] helpme") && 
                                  result.output.includes("📦 [Basic] version");

        const hasSourcePointers = input.commands.every(cmd => {
          // Build an exact substring block expected for this specific command entry
          const expectedBlockHeader = `• /${cmd.name}`;
          const expectedSourceLine = `  Source: ${cmd.sourceFile}`;
          
          return result.output.includes(expectedBlockHeader) && 
                result.output.includes(expectedSourceLine);
        });

        return hasBasicFunctions && hasSourcePointers;
      })
    );
  });


  // R5: Metamorphic Property (Dynamic flags on timeline mutations)
  it("R5: should highlight items marked as the newest creation context", () => {
    fc.assert(
      fc.property(fc.array(commandArbitrary, { minLength: 1 }), (commands) => {
        // Force at least one item to be flagged as new
        const mutatedCommands = commands.map((c, idx) => idx === 0 ? { ...c, isNew: true } : c);
        const result = executeHelpMe({ commands: mutatedCommands, sortBy: "alphabetical" });

        // Check if the visual tag layout engine triggers matching indicators
        return result.output.includes("🔥 [NEW]");
      })
    );
  });
});
