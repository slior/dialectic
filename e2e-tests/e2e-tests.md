# End-to-End (E2E) Testing Documentation

## Overview

The e2e testing system allows you to run automated tests across multiple design problems. Each test can be executed against any problem, creating a matrix of test-problem combinations. This separation allows you to:

- **Define problems once** - Problem statements and default configurations are stored in the `examples/` directory
- **Define tests once** - Test scripts are stored in the `e2e-tests/` directory and can be reused across all problems
- **Run any test against any problem** - The test runner executes all combinations you specify

The system automatically:
- Discovers available problems and tests
- Executes test scripts for each problem-test combination
- Runs evaluations on the generated debates
- Generates CSV reports with evaluation scores

## Test Structure

Each test in the `e2e-tests/` directory consists of:

### Required Files

1. **`run_test.sh`** - Executes the debate(s) for the test
   - Accepts three arguments: `PROBLEM_DIR`, `OUTPUT_DIR`, `TEST_DIR`
   - `PROBLEM_DIR` - Path to the problem directory (contains `problem.md` and default configs)
   - `OUTPUT_DIR` - Path where debate results should be written
   - `TEST_DIR` - Path to the test directory (for test-specific configs, if needed)

2. **`eval_run.sh`** - Executes evaluations on the generated debates
   - Accepts the same three arguments as `run_test.sh`
   - Reads debate JSON files from `OUTPUT_DIR`
   - Writes evaluation JSON files (`.eval.json`) to `OUTPUT_DIR`

### Optional Files

- **Test-specific configuration files** - Some tests require their own configuration files:
  - `debate-config_*.json` or `debate-*.json`- Variations of the base `debate-config.json` with descriptive suffixes indicating what's different. These are modifications of the standard config file.
    - Example: `debate-config_no_summary.json` (same structure as `debate-config.json` but with summarization disabled)
    - Example: `debate-config_context_search_no_history.json` (standard config with context search enabled but full history disabled)
    - Example: `debate-arch-arch.json` (configuration for a debate with two architect agents)
    - Example: `debate-gemini-2.5-flashlite.json` (configuration using the Gemini 2.5 Flash Lite model)
  - `eval_config.json` - Custom evaluation configuration (if different from problem default)

### Available Tests

The project already includes several tests:

- **`clarify_test`** - Tests debates with and without the clarification phase
- **`rounds_test`** - Tests debates with different numbers of rounds (1-5)
- **`summary_test`** - Tests different summarization and context search configurations
- **`role_subsets`** - Tests debates with different combinations of agent roles
- **`different_models`** - Tests debates using different LLM models

Other tests can be added of course.

## Problem Structure

Each problem in the `examples/` directory contains:

### Required Files

1. **`problem.md`** - The problem statement describing what needs to be designed
2. **`debate-config.json`** - Default debate configuration (agents, judge, debate settings)
3. **`eval_config.json`** - Default evaluation configuration

Optionally, you can add a context file (another markdown), and reference it from the `run_test` script.
Note, however, that the test script is orthogonal to the problem definition, so it generally needs to account for cases where no context file is provided. 

### Directory Layout

```
examples/
  kata1/
    problem.md
    debate-config.json
    eval_config.json
  kata2/
    problem.md
    debate-config.json
    eval_config.json
  ...

e2e-tests/
  clarify_test/
    run_test.sh
    eval_run.sh
  rounds_test/
    run_test.sh
    eval_run.sh
  summary_test/
    run_test.sh
    eval_run.sh
    debate-config_no_summary.json
    debate-config_context_search_no_history.json
  role_subsets/
    run_test.sh
    eval_run.sh
    debate-arch-arch.json
    debate-arch-kiss.json
    ...
  different_models/
    run_test.sh
    eval_run.sh
    debate-gemini-2.5-flashlite.json
    debate-gpt-51-codex-mini.json
    ...
```

## Running E2E Tests

The test runner script is `e2e-tests/run-tests.ts`. It discovers all available problems and tests, then executes each test against each problem.

### Basic Usage

```bash
npx ts-node e2e-tests/run-tests.ts <base_output_dir>
```

This runs all tests against all problems. Results are written to the specified output directory.

### Filtering Tests

Run only specific tests:

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests clarify_test,rounds_test
```

### Filtering Problems

Run tests against specific problems:

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --problems kata1,kata3
```

### Combining Filters

Run specific tests against specific problems:

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests summary_test --problems kata1
```

### Output Structure

Results are organized by problem and test:

```
<base_output_dir>/
  kata1/
    clarify_test/
      debate-with-clarify.json
      debate-without-clarify.json
      eval_with-clarify.eval.json
      eval_without-clarify.eval.json
      kata1_clarify_test_results.csv
    rounds_test/
      ...
  kata2/
    clarify_test/
      ...
```

Each test directory contains:
- Debate JSON files (generated by `run_test.sh`)
- Evaluation JSON files (generated by `eval_run.sh`, ending in `.eval.json`)
- CSV summary file (generated automatically, named `<problem>_<test>_results.csv`)

## Adding a New Test

To add a new test, create a new directory under `e2e-tests/` with the following structure:

### Step 1: Create Test Directory

```bash
mkdir e2e-tests/my_new_test
```

### Step 2: Create `run_test.sh`

Create a script that runs your debates. The script must accept three arguments:

```bash
#!/bin/bash

# Check if required arguments are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Error: Problem directory, output directory, and test directory arguments are required" >&2
    echo "Usage: $0 <problem_dir> <output_dir> <test_dir>" >&2
    exit 1
fi

PROBLEM_DIR="$1"
OUTPUT_DIR="$2"
TEST_DIR="${3:-}"  # Optional third parameter

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Use test-specific config if it exists, otherwise use problem config
if [ -n "$TEST_DIR" ] && [ -f "$TEST_DIR/debate-config.json" ]; then
  CONFIG="$TEST_DIR/debate-config.json"
else
  CONFIG="$PROBLEM_DIR/debate-config.json"
fi

# Run your debates
dialectic debate -r 3 -c "$CONFIG" -o "$OUTPUT_DIR/my-debate.json" -p "$PROBLEM_DIR/problem.md" -v
```

**Note:** If your test requires test-specific configurations, make `TEST_DIR` mandatory (remove the fallback):

```bash
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Error: Test directory is required for this test" >&2
    exit 1
fi

# Use test-specific configs (required)
CONFIG="$TEST_DIR/debate-config_custom.json"
```

### Step 3: Create `eval_run.sh`

Create a script that evaluates the generated debates:

```bash
#!/bin/bash

# Check if required arguments are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Error: Problem directory and output directory arguments are required" >&2
    echo "Usage: $0 <problem_dir> <output_dir> [test_dir]" >&2
    exit 1
fi

PROBLEM_DIR="$1"
OUTPUT_DIR="$2"
TEST_DIR="${3:-}"  # Optional

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Use test-specific eval config if it exists, otherwise use problem config
if [ -n "$TEST_DIR" ] && [ -f "$TEST_DIR/eval_config.json" ]; then
  EVAL_CONFIG="$TEST_DIR/eval_config.json"
else
  EVAL_CONFIG="$PROBLEM_DIR/eval_config.json"
fi

# Run evaluations
dialectic eval -c "$EVAL_CONFIG" -d "$OUTPUT_DIR/my-debate.json" -v -o "$OUTPUT_DIR/eval_my-debate.eval.json"
```

### Step 4: Add Test-Specific Configs (Optional)

If your test needs custom configurations, place them in the test directory:

```
e2e-tests/my_new_test/
  run_test.sh
  eval_run.sh
  debate-config_custom.json  # Test-specific debate config
  eval_config.json            # Test-specific eval config (optional)
```

### Step 5: Make Scripts Executable

```bash
chmod +x e2e-tests/my_new_test/run_test.sh
chmod +x e2e-tests/my_new_test/eval_run.sh
```

### Step 6: Run Your Test

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests my_new_test
```

## Adding a New Problem

To add a new problem, create a new directory under `examples/`:

### Step 1: Create Problem Directory

```bash
mkdir examples/my_problem
```

### Step 2: Create `problem.md`

Write the problem statement:

```markdown
# My Problem

Design a system that...

Requirements:
- Requirement 1
- Requirement 2
```

### Step 3: Create `debate-config.json`

Create the default debate configuration:

```json
{
  "agents": [
    {
      "id": "agent-architect",
      "name": "System Architect",
      "role": "architect",
      "model": "gpt-4",
      "provider": "openai",
      "temperature": 0.5,
      "enabled": true
    }
  ],
  "judge": {
    "id": "judge-main",
    "name": "Technical Judge",
    "role": "generalist",
    "model": "gpt-4",
    "provider": "openai",
    "temperature": 0.5
  },
  "debate": {
    "rounds": 3,
    "terminationCondition": {
      "type": "fixed"
    },
    "synthesisMethod": "judge",
    "includeFullHistory": true,
    "timeoutPerRound": 300000
  }
}
```

### Step 4: Create `eval_config.json`

Create the evaluation configuration:

```json
{
  "agents": [
    {
      "id": "eval-1",
      "name": "Evaluator 1",
      "model": "gpt-4",
      "provider": "openai",
      "timeout": 30000,
      "enabled": true,
      "systemPromptPath": "../eval_system.md",
      "userPromptPath": "../eval_user.md"
    }
  ]
}
```

### Step 5: Run Tests Against Your Problem

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --problems my_problem
```

## Configuration File Resolution

The system resolves configuration files using the following priority:

### Debate Configurations

1. **Test-specific configs** - If `TEST_DIR` is provided and a config exists in the test directory, use it
2. **Problem default config** - Otherwise, use `PROBLEM_DIR/debate-config.json`

Some tests (like `summary_test`, `role_subsets`, `different_models`) require test-specific configs and will error if `TEST_DIR` is not provided.

### Evaluation Configurations

1. **Test-specific eval config** - If `TEST_DIR` is provided and `TEST_DIR/eval_config.json` exists, use it
2. **Problem default eval config** - Otherwise, use `PROBLEM_DIR/eval_config.json`

Most tests use the problem's default evaluation configuration.

## CSV Output Format

The generated CSV files contain the following columns:

- `example name` - The problem name
- `eval result file name` - The evaluation JSON filename
- `functional_completeness score` - Functional completeness score
- `performance_scalability score` - Performance and scalability score
- `security score` - Security score
- `maintainability score` - Maintainability and evolvability score
- `regulatory_compliance score` - Regulatory compliance score
- `testability score` - Testability score
- `overall_score` - Overall aggregate score

Empty values indicate that a particular metric was not evaluated or scored.

## Troubleshooting

### Test Script Fails

- Check that all required arguments are provided
- Verify that configuration files exist in the expected locations
- Ensure scripts are executable (`chmod +x`)
- Check that paths are correct (scripts run from project root)

### Missing Configurations

- Verify that `debate-config.json` exists in the problem directory
- Verify that `eval_config.json` exists in the problem directory
- For tests requiring test-specific configs, ensure they exist in the test directory

### No Results Generated

- Check that debates were successfully created (look for `.json` files in output directory)
- Verify that evaluation scripts can find the debate files
- Check that evaluation scripts have correct file paths

## Examples

### Run All Tests on All Problems

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests
```

### Run Only Clarify Test on Kata1

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests clarify_test --problems kata1
```

### Run Different Models Test on All Problems

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests different_models
```

### Run Multiple Tests on Multiple Problems

```bash
npx ts-node e2e-tests/run-tests.ts ~/tmp/dialectic/tests --tests clarify_test,rounds_test --problems kata1,kata2,kata3
```

