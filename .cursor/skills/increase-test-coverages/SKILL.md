---
description: Run the unit-test-agent over multiple files to raise Jest coverage to a target percentage (default 97%) on all metrics, in parallel.
---

## Purpose

Use this skill when you have **several TypeScript files** that all need their Jest unit test coverage raised to at least a given target (default **97%** for statements, branches, functions, and lines).

This skill **does not write tests directly**. Instead, it **delegates** to the single-file agent:

- `@.cursor/agents/unit-test-agent/`

## Inputs

- **files** (required)
  - A list of file paths in this project to improve.
  - Example:  
    - `["packages/core/src/core/judge.ts", "packages/core/src/core/state-manager.ts"]`
- **targetCoverage** (optional)
  - Desired minimum coverage percentage for **all metrics** (statements, branches, functions, lines).
  - If omitted, use **97**.

## How to use this skill

1. **Collect the inputs**
   - Ensure you have at least one file path.
   - If the caller did not supply a target, set `targetCoverage = 97`.

2. **Start one unit-test-agent per file (in parallel)**
   - For each file in `files`, **launch a separate instance** of `@.cursor/agents/unit-test-agent/`.
   - Pass the following to each instance:
     - `filePath` (or equivalent) = that file’s path.
     - `targetCoverage` = the shared target (or the per-file target, if the caller provided one).
   - **Important**: start all these agent instances **in parallel**, not one after another, so multiple files can be improved at the same time.

3. **Let each unit-test-agent do the detailed work**
   - Do **not** re-implement coverage logic here.
   - Each unit-test-agent will:
     - Use `@.cursor/commands/increase-unit-test-coverage.mdc` for its file.
     - Add or update tests.
     - Re-run coverage until its file reaches **at least** the requested coverage on all metrics.

4. **Wait for all agents to finish**
   - Wait until **every** unit-test-agent instance has completed.
   - Collect, for each file:
     - final coverage (statements, branches, functions, lines),
     - whether the target was met,
     - any notable actions (e.g. test files created).

5. **Summarize the outcome**

When reporting back, clearly list:

- The **target coverage** used (default 97 if not specified).
- For each file:
  - the file path,
  - whether the target was met on all metrics,
  - any important notes (e.g. “created new spec file”, “added branch tests for X”).

## Example usages

- **Default target (97%)**

  “Increase unit test coverage for these files:
  - `packages/core/src/state-machine/node.ts`
  - `packages/core/src/core/judge.ts`
  - `packages/core/src/core/state-manager.ts`”

  Behavior:
  - Set `targetCoverage = 97`.
  - Launch **three** parallel `unit-test-agent` instances, one per file, each with:
    - `filePath` = that file,
    - `targetCoverage = 97`.

- **Custom target (e.g. 99%)**

  “Raise coverage for:
  - `packages/core/src/state-machine/graph.ts`
  - `packages/core/src/state-machine/state-machine-orchestrator.ts`
  to **99% on all coverage metrics**.”

  Behavior:
  - Set `targetCoverage = 99`.
  - Launch **two** parallel `unit-test-agent` instances, one per file, each with:
    - `filePath` = that file,
    - `targetCoverage = 99`.

