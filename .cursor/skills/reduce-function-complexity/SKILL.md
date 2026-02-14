---
name: reduce-function-complexity
description: Reduces cyclomatic/cognitive complexity of a single function or method to below 10 by extracting logical, cohesive blocks into well-named helpers. Use when a function exceeds complexity limits, when the user asks to simplify or refactor a specific function, or when lint reports complexity errors for a function.
---

# Reduce Function Complexity

Use this skill when you need to **lower the complexity of one function or method** so it passes the project’s complexity rules (e.g. ESLint `complexity` max 10, `sonarjs/cognitive-complexity`). Work **only on that one function** per skill run; do not refactor multiple functions in one go.

## Inputs

- **functionName** (required): The name of the function or method to reduce (e.g. `execute`, `collectQuestionsAndDecideOnNextStep`).
- **filePath** (optional): Full path to the file containing the function. If omitted, infer from the user’s current file or ask.

## How to use this skill

1. **Locate the function**
   - Resolve the file path (from input or current context).
   - Open the file and find the single function/method with the given name.
   - Confirm it is the correct target (e.g. only one overload or export with that name).

2. **Determine the Nx project**
   - From the file path, set `{package}`:
     - `packages/core/` → `core`
     - `packages/cli/` → `cli`
     - `packages/web-api/` → `web-api`
   - Other packages: use the directory name under `packages/` as the project name.

3. **Check current complexity**
   - Run: `npx nx run {package}:lint` (or `npx nx run {package}:lint:fix` if the repo defines a target that reports complexity).
   - In the output, look for the **function name** and any **complexity** or **cognitive-complexity** message (e.g. “Function 'execute' has a complexity of 12. Maximum allowed is 10”).
   - If the function is not reported or is already below the limit, stop and report that no change is needed.
   - If it is over the limit, note the reported complexity and proceed.

4. **Reduce complexity by extracting (one block at a time)**
   - Work **on one function only**. Do not refactor other functions in the same file in this run.
   - Inside that function, identify **one** logical, cohesive block (e.g. a conditional branch, a sequence that computes a value, a loop body, or a clear “step”).
   - Extract it using the **Extract Function** command:
     - **Command**: `@.cursor/commands/extract-function.mdc`
     - Provide the **exact code selection** (line range or selection) for that block.
     - Choose a **clear, verb-based name** that describes what the block does and keeps the original function readable (e.g. `doFollowUpRound`, `updateStateAndSignalPendingQuestions`, `collectQuestionsAndDecideOnNextStep`).
   - Follow the command’s steps: same behavior, typed params/return, JSDoc, place the new function/method after the caller.
   - After each extraction, **replace** the original block with a single call to the new function/method so the original function reads coherently.

5. **Re-check complexity**
   - Run again: `npx nx run {package}:lint`
   - Check whether the **same function** still appears in the complexity report.
   - If its complexity is still ≥ 10, repeat step 4 (pick another block in the **same** function and extract again).
   - Stop when that function is no longer reported or is below the limit.

6. **Verify and report**
   - Run tests for the project: `npx nx run {package}:test` (or the project’s test target).
   - Fix any lint or test failures introduced by the extractions.
   - Report: function name, file, final complexity (if shown), and the names of any new helpers extracted.

## Rules

- **One function per run**: Only refactor the single function/method named in the input. Do not simplify other functions in the same file in this skill run.
- **Use Extract Function command**: Every extraction must follow `@.cursor/commands/extract-function.mdc` (parameters, return type, JSDoc, placement, behavior unchanged).
- **Coherent naming**: Extracted names should make the **original** function read like a high-level workflow (e.g. “if follow-up round then doFollowUpRound else collectQuestionsAndDecideOnNextStep”).
- **Complexity check**: Use `npx nx run {package}:lint` to see if the function still exceeds the limit; iterate until it is below 10 (or no longer reported).

## Example

User: “Reduce complexity of `execute` in `packages/core/src/state-machine/nodes/clarification-node.ts`.”

1. Open `clarification-node.ts`, find `execute`.
2. Project from path: `core`. Run `npx nx run core:lint`, see e.g. “Function 'execute' has a complexity of 12.”
3. Inside `execute`, pick a block (e.g. the follow-up round branch). Extract with `@.cursor/commands/extract-function.mdc` into `doFollowUpRound`. Replace the block with `return this.doFollowUpRound(...)`.
4. Run `npx nx run core:lint` again. If `execute` still reported, pick another block (e.g. “collect questions and decide”) and extract to `collectQuestionsAndDecideOnNextStep`.
5. Repeat until `execute` is no longer in the complexity report (or below 10). Run `npx nx run core:test`, fix any issues, then report the result.

## Output

- The target function’s complexity is reduced and passes lint.
- New helper function(s) are well-named, typed, and documented per the extract-function command.
- Tests still pass; no new lint errors.
