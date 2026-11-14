import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import {
  executeHelpMe,
  type CommandItem,
  type HelpMeInput,
} from "../../src/command/index.ts";

fc.configureGlobal({ seed: 7 });

// --- Arbitrary Generators ---

const customCommandName = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/)
  .filter((name) => !["init", "important", "btw", "orient", "review", "helpme"].includes(name));

const commandType = fc.constantFrom<"read" | "write" | "delete">("read", "write", "delete");

const commandArbitrary: fc.Arbitrary<CommandItem> = fc.record({
  name: customCommandName,
  type: commandType,
  description: fc.string({ maxLength: 60 }),
  sourceFile: fc.oneof(
    fc.stringMatching(/^command\/[a-zA-Z0-9_-]+\.md$/),
    fc.stringMatching(/^commands\/[a-zA-Z0-9_-]+\.md$/),
  ),
  isNew: fc.boolean(),
});

// Unique names ensure deterministic sort/order assertions.
const uniqueCustomCommands = (minLength = 0, maxLength = 20) =>
  fc.uniqueArray(commandArbitrary, { minLength, maxLength, selector: (cmd) => cmd.name });

const customHelpMeInput: fc.Arbitrary<HelpMeInput> = fc.record({
  commands: uniqueCustomCommands(0, 20),
  sortBy: fc.constantFrom("alphabetical", "type"),
  reportFeedback: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
});

const commandBlockRegex = /^• \/([a-zA-Z][a-zA-Z0-9_-]*)( 🔥 \[NEW\])?$/gm;

describe("helpme command property-based tests (custom commands)", () => {
  // P1: Every custom command is listed exactly once (no omissions, no duplicates)
  it("lists every custom command exactly once, regardless of input size", () => {
    fc.assert(
      fc.property(uniqueCustomCommands(0, 20), (commands) => {
        const result = executeHelpMe({ commands, sortBy: "alphabetical" });

        expect(result.success).toBe(true);

        const rendered = [...result.output.matchAll(commandBlockRegex)].map((m) => m[1]);
        const expected = [...commands].sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.name);

        expect(rendered).toEqual(expected);
        expect(new Set(rendered).size).toBe(rendered.length);
      }),
    );
  });

  // P2: Alphabetical sort is strict and total
  it("sorts custom commands strictly alphabetically by name", () => {
    fc.assert(
      fc.property(uniqueCustomCommands(2, 20), (commands) => {
        const result = executeHelpMe({ commands, sortBy: "alphabetical" });

        const rendered = [...result.output.matchAll(commandBlockRegex)].map((m) => m[1]);
        const expected = [...commands]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => c.name);

        expect(rendered).toEqual(expected);
      }),
    );
  });

  // P3: Type sort groups by type; ties resolved consistently
  it("sorts custom commands by type with consistent tie-breaking", () => {
    fc.assert(
      fc.property(uniqueCustomCommands(2, 20), (commands) => {
        const result = executeHelpMe({ commands, sortBy: "type" });

        const rendered = [...result.output.matchAll(commandBlockRegex)].map((m) => m[1]);
        const expected = [...commands]
          .sort((a, b) => a.type.localeCompare(b.type))
          .map((c) => c.name);

        expect(rendered).toEqual(expected);
      }),
    );
  });

  // P4: Each command block carries its exact type, description, and source file
  it("renders exact Type, Description, and Source lines for every custom command", () => {
    fc.assert(
      fc.property(uniqueCustomCommands(1, 20), (commands) => {
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
      }),
    );
  });

  // P5: The ` 🔥 [NEW]` tag appears iff `isNew` is true; input is never mutated
  it("attaches the [NEW] tag iff isNew is true and never mutates the input array", () => {
    fc.assert(
      fc.property(uniqueCustomCommands(1, 20), (commands) => {
        const snapshot = structuredClone(commands);
        const result = executeHelpMe({ commands, sortBy: "alphabetical" });

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
      }),
    );
  });

  // P6: `success` is always true and output always ends with the system footer
  it("always returns success:true and renders the system operations footer", () => {
    fc.assert(
      fc.property(customHelpMeInput, (input) => {
        const result = executeHelpMe(input);

        expect(result.success).toBe(true);
        expect(result.output).toContain("--- System Operations ---");
        expect(result.output).toContain("📦 [Basic] helpme - Explains basic and custom command operations workspace-wide.");
        expect(result.output.endsWith("\n")).toBe(false);
      }),
    );
  });

  // P7: Feedback does not alter the custom command listing
  it("keeps the custom command listing identical with or without reportFeedback", () => {
    fc.assert(
      fc.property(customHelpMeInput, fc.option(fc.string({ minLength: 1 })), (input, feedback) => {
        const baseline = executeHelpMe({ ...input, reportFeedback: undefined });
        const withFeedback = executeHelpMe({ ...input, reportFeedback: feedback });

        const stripFeedback = (out: string) =>
          out
            .split("\n")
            .filter((line) => !line.startsWith("⚠️  Report Button Triggered!") && !line.startsWith("🔄 Rectifying"))
            .join("\n");

        expect(stripFeedback(withFeedback.output)).toBe(stripFeedback(baseline.output));
      }),
    );
  });

  // P8: Empty custom command list still renders the system footer with zero command blocks
  it("renders only system headers when there are no custom commands", () => {
    fc.assert(
      fc.property(fc.record({ sortBy: fc.constantFrom("alphabetical", "type") }), ({ sortBy }) => {
        const result = executeHelpMe({ commands: [], sortBy });

        expect(result.success).toBe(true);
        expect(result.output).toContain("--- System Operations ---");
        expect(result.output).toContain("--- Registered Tool Commands ---");
        expect([...result.output.matchAll(commandBlockRegex)]).toHaveLength(0);
      }),
    );
  });
});
