# AGENTS.md

## Project Overview

Dialectic is a CLI tool that orchestrates multi-agent debates to solve software design problems. The system uses multiple AI agents with different perspectives (architecture, performance, security, testing, simplicity) to debate a problem through structured rounds of proposals, critiques, and refinements, culminating in a synthesized solution from a judge agent.

**Key Technologies:**
- **Language**: TypeScript (ES2022)
- **Runtime**: Node.js >= 18
- **Testing Framework**: Jest with ts-jest
- **Build Tool**: TypeScript Compiler (tsc)
- **LLM Providers**: OpenAI API and OpenRouter API
- **CLI Framework**: Commander.js

**Main Components:**
- **Core Orchestrator**: Manages debate rounds and phases (proposal, critique, refinement)
- **Agents**: Role-based agents (architect, performance, security, testing, kiss, generalist)
- **Judge Agent**: Synthesizes final solutions from debate history
- **State Manager**: Persists debate state to JSON files
- **LLM Providers**: Abstracted provider interface supporting OpenAI and OpenRouter
- **CLI**: Command-line interface for running debates and evaluations

**Key Features:**
- Multi-round debate orchestration with configurable rounds
- Role-based agent system with customizable prompts
- Context summarization to manage debate history length
- Interactive clarifications phase for problem refinement
- Debate state persistence and report generation
- Evaluator command for assessing debate outcomes
- Tool calling support allowing agents to interact with external tools during debates

## Command-Line Usage

Dialectic is invoked from the command line using the `dialectic` command. This section provides comprehensive examples for running debates and evaluations in a bash shell environment.

### Basic Command Structure

**Debate Command:**
```bash
dialectic debate [problem] [options]
```

**Evaluator Command:**
```bash
dialectic eval [options]
```

### Problem Input

You can provide the problem statement in two ways:

**1. Inline string:**
```bash
dialectic debate "Design a rate limiting system"
dialectic debate "Build a secure authentication API with JWT tokens"
```

**2. Problem description file:**
```bash
dialectic debate --problemDescription problem.txt
dialectic debate --problemDescription ./problems/rate-limiting.md
dialectic debate --problemDescription ../design-problems/cache-system.md
```

**Problem File Requirements:**
- **Encoding**: UTF-8
- **Format**: Any text format (plain text, markdown, etc.)
- **Content**: Must be non-empty (whitespace-only files are rejected)
- **Path**: Relative paths resolved from current working directory
- **Mutual exclusivity**: Cannot provide both inline problem string and `--problemDescription` file

### Configuration File

**Default configuration:**
```bash
dialectic debate "Design a caching system"
# Uses ./debate-config.json if it exists, otherwise uses built-in defaults
```

**Custom configuration file:**
```bash
dialectic debate "Design a caching system" --config ./configs/production.json
dialectic debate "Design a caching system" --config /path/to/custom-config.json
```

**Configuration file location:**
- Default: `./debate-config.json` (relative to current working directory)
- Custom: Specify with `--config <path>`
- If file doesn't exist: System uses built-in defaults with a warning to stderr

### Agent Selection

**Default agents (architect, performance, and kiss):**
```bash
dialectic debate "Design a database system"
```

**Select specific agent roles:**
```bash
dialectic debate "Design a secure API" --agents architect,security
dialectic debate "Build a high-performance system" --agents architect,performance,security
dialectic debate "Design a testable system" --agents architect,testing
dialectic debate "Design a simple API" --agents architect,kiss
```

**Available agent roles:**
- `architect` - System design and architecture perspective
- `performance` - Performance optimization and efficiency
- `security` - Security and threat modeling
- `testing` - Testing strategy and quality assurance
- `kiss` - Simplicity-focused perspective, challenges complexity
- `generalist` - General-purpose role (typically used for judge)

**Note:** The `--agents` option filters agents from your configuration file by role. If no agents match, the system falls back to default agents (architect, performance, and kiss).

### Debate Rounds

**Default rounds (3):**
```bash
dialectic debate "Design a messaging system"
```

**Custom number of rounds:**
```bash
dialectic debate "Design a messaging system" --rounds 1
dialectic debate "Design a messaging system" --rounds 5
dialectic debate "Design a messaging system" --rounds 10
```

**Constraints:**
- Minimum: 1 round
- Default: 3 rounds
- Invalid values (e.g., 0, negative) result in exit code 2

### Output Options

**Default output (stdout):**
```bash
dialectic debate "Design a rate limiting system"
# Final solution text written to stdout
# Full debate state saved to ./debates/deb-YYYYMMDD-HHMMSS-RAND.json
```

**Save solution text to file:**
```bash
dialectic debate "Design a rate limiting system" --output solution.txt
dialectic debate "Design a rate limiting system" --output ./results/solution.txt
```

**Save full debate state (JSON):**
```bash
dialectic debate "Design a rate limiting system" --output debate-result.json
dialectic debate "Design a rate limiting system" --output ./results/debate-result.json
```

**Output behavior:**
- If path ends with `.json`: Full debate state (JSON) written to file
- Otherwise: Only final solution text written to file
- If omitted: Solution written to stdout, state saved to `./debates/` directory

**Redirecting output:**
```bash
# Save solution to file
dialectic debate "Design a system" --output solution.txt

# Pipe solution to another command
dialectic debate "Design a system" | grep "recommendation"

# Suppress solution output (save to file instead)
dialectic debate "Design a system" --output solution.txt > /dev/null
```

### Verbose Mode

**Enable detailed logging:**
```bash
dialectic debate "Design a system" --verbose
```

**Verbose output includes:**
- Round-by-round breakdown
- Individual contributions with metadata (tokens, latency)
- Total statistics (rounds, duration, token counts)
- System prompt sources (built-in vs file path)
- Written to stderr (doesn't interfere with stdout piping)

**Example with verbose:**
```bash
dialectic debate "Design a system" --verbose --output solution.txt
# Solution goes to solution.txt
# Verbose diagnostics go to stderr
```

### Markdown Report Generation

**Generate debate report:**
```bash
dialectic debate "Design a system" --report debate-report.md
dialectic debate "Design a system" --report ./reports/debate-report
```

**Report features:**
- Extension auto-appended if missing (`.md` added automatically)
- Parent directories created automatically
- Non-fatal on failure (debate succeeds even if report generation fails)
- Includes full debate transcript, metadata, clarifications, and synthesis

**Report with verbose metadata:**
```bash
dialectic debate "Design a system" --verbose --report ./reports/debate-report.md
# Report includes latency and token counts in contribution titles
```

**Report contents:**
- Problem Description
- Agents table and Judge table
- Clarifications (if `--clarify` was used)
- Rounds with proposals, critiques, and refinements
- Final Synthesis

### Interactive Clarifications

**Enable clarifications phase:**
```bash
dialectic debate "Design a distributed cache system" --clarify
```

**Clarifications workflow:**
1. Each agent generates up to 5 clarifying questions (configurable)
2. CLI presents questions grouped by agent in interactive session
3. Answer each question or press Enter to skip (recorded as "NA")
4. Questions and answers included in debate context and final report

**Example interaction:**
```bash
dialectic debate "Design a distributed cache system" --clarify
# [Architect] Q1: What are the expected read/write ratios?
# > 80% reads, 20% writes
# [Performance] Q2: What's the target latency requirement?
# > < 10ms for 95th percentile
# [Security] Q3: What data sensitivity level?
# > (press Enter to skip)
# Q3: NA
```

**Clarifications with other options:**
```bash
dialectic debate --problemDescription problem.md --clarify --agents architect,security
dialectic debate "Design a system" --clarify --rounds 5 --verbose
```

### Tool Calling

Agents can call tools during proposal, critique, and refinement phases. Tools allow agents to interact with external functionality, such as searching debate history.

**Base Tools Available to All Agents:**

- **Context Search** (`context_search`): Search for terms in the debate history
  - Parameters: `term` (string, required) - The search term to find
  - Returns: Array of matching contributions with metadata (round number, agent ID, role, type, content snippet)

**Tool Configuration:**

Tools are configured per agent in the `AgentConfig` using the `tools` field. Each tool must follow the OpenAI function calling schema format:

```json
{
  "id": "agent-architect",
  "name": "System Architect",
  "role": "architect",
  "model": "gpt-4",
  "provider": "openai",
  "temperature": 0.5,
  "tools": [
    {
      "name": "custom_tool",
      "description": "A custom tool description",
      "parameters": {
        "type": "object",
        "properties": {
          "paramName": {
            "type": "string",
            "description": "Parameter description"
          }
        },
        "required": ["paramName"]
      }
    }
  ],
  "toolCallLimit": 10
}
```

**Tool Call Limits:**

The `toolCallLimit` field controls the maximum number of tool call iterations per phase (proposal, critique, or refinement). Each iteration counts toward the limit, including failed tool invocations. The default limit is `10` iterations per phase per agent.

**Tool Execution Behavior:**

- Tools are executed synchronously
- User feedback messages are displayed when tools are executed (e.g., `[Agent Name] Executing tool: context_search`)
- Failed tool invocations are logged as warnings but do not stop the debate
- Tool calls and results are stored in contribution metadata for persistence
- Tool call metadata includes: `toolCalls`, `toolResults`, and `toolCallIterations`

**Example with Tool Calling:**

When an agent uses tools, you'll see messages like:
```
[System Architect] Executing tool: context_search
```

Tool calls and results are automatically included in the debate state and can be viewed in generated reports.

**Note**: Currently, only base registry tools (like Context Search) are available. Agent-specific tools from configuration require tool implementation factories (future enhancement). See `docs/configuration.md` for more details on tool configuration.

### Environment File

**Default environment file (`.env`):**
```bash
dialectic debate "Design a system"
# Automatically loads .env from current directory if it exists
```

**Custom environment file:**
```bash
dialectic debate "Design a system" --env-file ./config/.env.production
dialectic debate "Design a system" --env-file /path/to/.env
```

**Environment variables required:**
- `OPENAI_API_KEY` - Required for OpenAI provider
- `OPENROUTER_API_KEY` - Required for OpenRouter provider

### Complete Examples

**Simple debate:**
```bash
dialectic debate "Design a rate limiting system"
```

**Complex debate with all options:**
```bash
dialectic debate \
  --problemDescription ./problems/rate-limiting.md \
  --config ./configs/production.json \
  --agents architect,performance,security \
  --rounds 5 \
  --output ./results/rate-limiting-solution.json \
  --report ./reports/rate-limiting-report.md \
  --verbose \
  --clarify \
  --env-file .env.production
```

**Quick security-focused debate:**
```bash
dialectic debate "Design a secure authentication system" \
  --agents architect,security \
  --rounds 3 \
  --output auth-solution.txt \
  --verbose
```

**Save debate state for later evaluation:**
```bash
dialectic debate "Design a system" \
  --output ./debates/my-debate.json \
  --rounds 3
```

### Report Command

**Generate report from saved debate state:**
```bash
dialectic report --debate ./debates/deb-20250101-010203-ABC.json
```

**Generate report without config file (creates minimal configs from debate state):**
```bash
dialectic report --debate ./debates/deb-20250101-010203-ABC.json
# Creates minimal agent/judge configs from debate state, no validation
```

**Generate report with config file (matches agent/judge configs):**
```bash
dialectic report --debate ./debates/deb-20250101-010203-ABC.json --config ./debate-config.json
```

**Save report to file:**
```bash
dialectic report --debate ./debates/debate.json --output ./reports/report.md
```

**Report with verbose metadata:**
```bash
dialectic report --debate ./debates/debate.json --verbose --output report.md
```

**Report behavior:**
- If `--config` is provided: loads configuration file and matches agent/judge configs with agent IDs found in debate state
- If `--config` is not provided: creates minimal agent/judge configs from debate state (extracts agent IDs and roles from contributions), no validation of IDs
- Generates markdown report identical to `--report` option in debate command
- Writes to stdout by default, or to specified file if `--output` provided

**Report options:**
- `--debate <path>`: Path to debate JSON file (DebateState format) (required)
- `--config <path>`: Optional path to configuration file. If not provided, creates minimal configs from debate state.
- `-o, --output <path>`: Optional path to output markdown file (default: stdout)
- `-v, --verbose`: Optional verbose mode for report generation

### Evaluator Command

**Basic evaluation:**
```bash
dialectic eval --config ./eval-config.json --debate ./debates/deb-20250101-010203-ABC.json
```

**Evaluator with JSON output:**
```bash
dialectic eval \
  --config ./eval-config.json \
  --debate ./debates/deb-20250101-010203-ABC.json \
  --output ./results/evaluation.json
```

**Evaluator with verbose logs:**
```bash
dialectic eval \
  --config ./eval-config.json \
  --debate ./debates/deb-20250101-010203-ABC.json \
  --verbose \
  --env-file .env
```

**Evaluator options:**
- `-c, --config <path>`: Evaluator configuration JSON (required)
- `-d, --debate <path>`: Debate state JSON to evaluate (required)
- `--env-file <path>`: Optional .env file path
- `-v, --verbose`: Verbose diagnostic logs to stderr
- `-o, --output <path>`: Output destination
  - If ends with `.json`: writes aggregated JSON output
  - Otherwise: writes Markdown table (or stdout by default)

### Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid CLI arguments (e.g., missing problem, invalid rounds) |
| `3` | Provider error (reserved for future use) |
| `4` | Configuration error (e.g., missing `OPENAI_API_KEY`) |

**Checking exit codes:**
```bash
dialectic debate "Design a system" && echo "Success!"
dialectic debate "Design a system" || echo "Failed with code: $?"
```

### Command-Line Option Summary

**Debate Command Options:**
- `[problem]` - Problem statement as inline string (mutually exclusive with `--problemDescription`)
- `--problemDescription <path>` - Path to problem description file
- `--agents <list>` - Comma-separated agent roles (default: `architect,performance,kiss`)
- `--rounds <n>` - Number of debate rounds (default: `3`, minimum: `1`)
- `--config <path>` - Path to configuration file (default: `./debate-config.json`)
- `--env-file <path>` - Path to environment file (default: `.env`)
- `--output <path>` - Output file path (JSON or text based on extension)
- `--verbose` - Enable detailed logging to stderr
- `--report <path>` - Generate Markdown report (extension auto-appended)
- `--clarify` - Enable interactive clarifications phase

**Evaluator Command Options:**
- `-c, --config <path>` - Evaluator configuration JSON (required)
- `-d, --debate <path>` - Debate state JSON to evaluate (required)
- `--env-file <path>` - Optional .env file path
- `-v, --verbose` - Verbose diagnostic logs to stderr
- `-o, --output <path>` - Output destination (JSON or Markdown based on extension)

**Report Command Options:**
- `--debate <path>` - Path to debate JSON file (DebateState format) (required)
- `--config <path>` - Optional path to configuration file. If not provided, creates minimal configs from debate state.
- `-o, --output <path>` - Optional path to output markdown file (default: stdout)
- `-v, --verbose` - Optional verbose mode for report generation

## Build and Test Commands

### Setup Commands

**Install dependencies:**
```bash
npm install
```

**Build the project:**
```bash
npm run build
```

This compiles TypeScript source files from `src/` to `dist/` with source maps and type declarations.

**Development mode:**
```bash
npm run dev
```

Runs the CLI using `ts-node` for development without building.

### Test Commands

**Run all tests:**
```bash
npm test
```

Runs all test files in the `tests/` directory using Jest.

**Run tests in watch mode:**
```bash
npm run test:watch
```

Runs tests in watch mode, re-running tests when files change.

**Run tests with coverage measurement:**
```bash
npm run test:coverage
```

Generates coverage reports in multiple formats:
- **HTML Report**: `coverage/lcov-report/index.html` (view in browser)
- **LCOV**: `coverage/lcov.info` (for CI/CD integration)
- **JSON**: `coverage/coverage-final.json` (for programmatic access)

Coverage reports include:
- Line coverage percentage
- Branch coverage percentage
- Function coverage percentage
- Statement coverage percentage
- Uncovered lines and branches

**View Coverage Reports:**
- Open `coverage/lcov-report/index.html` in a web browser for interactive HTML report
- Use `coverage/lcov.info` for CI/CD integration with tools like Codecov or Coveralls

## Code Style Guidelines

This project uses TypeScript with strict type checking enabled. Please adhere to the following guidelines:

### TypeScript Configuration

The project uses strict TypeScript settings defined in `tsconfig.json`:

- **Strict Mode**: All strict type checking options are enabled
- **Target**: ES2022
- **Module**: CommonJS
- **File Layout**: Source files in `src/`, compiled output in `dist/`

### Code Style Rules

**Type Safety:**
- Use explicit types for function parameters and return values
- Avoid `any` type; use `unknown` when necessary, then narrow with type guards
- Enable `noImplicitAny`, `strictNullChecks`, and `noUncheckedIndexedAccess`
- Use `exactOptionalPropertyTypes` for precise optional property handling

**Naming Conventions:**
- Use camelCase for variables, functions, and methods
- Use PascalCase for classes, interfaces, and types
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names that indicate purpose and scope

**File Organization:**
- One main class/interface per file
- Group related functionality in the same directory
- Use barrel exports (`index.ts`) for public APIs

**Imports:**
- Use ES6 import/export syntax
- Group imports: external packages, then internal modules
- Use absolute imports from `src/` when appropriate

**Error Handling:**
- Use custom error classes with exit codes (see `src/utils/exit-codes.ts`)
- Include error codes in error objects: `err.code = EXIT_CONFIG_ERROR`
- Provide clear, actionable error messages

**Async/Await:**
- Prefer `async/await` over Promises with `.then()`
- Handle errors with try/catch blocks
- Use `Promise.all()` for parallel operations when appropriate

**Comments:**
- Use JSDoc comments for public functions and classes
- Include parameter descriptions and return types in JSDoc
- Document complex logic and non-obvious behavior
- Remove commented-out code before committing

### Example Code Style

```typescript
/**
 * Creates a debate orchestrator instance.
 * 
 * @param agents - Array of agent instances to participate
 * @param judge - Judge agent for synthesis
 * @param config - Debate configuration
 * @returns Orchestrator instance
 * @throws {Error} If agents array is empty
 */
export function createOrchestrator(
  agents: Agent[],
  judge: JudgeAgent,
  config: DebateConfig
): DebateOrchestrator {
  if (agents.length === 0) {
    const err: any = new Error('At least one agent is required');
    err.code = EXIT_INVALID_ARGS;
    throw err;
  }
  
  return new DebateOrchestrator(agents, judge, config);
}
```

### Linting and Formatting

While the project doesn't currently include ESLint or Prettier configuration files, maintain consistency with:
- 2-space indentation (as seen in `tsconfig.json`)
- Semicolons at end of statements
- Trailing commas in multi-line objects and arrays
- Single quotes for strings (preferred, but double quotes are acceptable)

## Code Cleanup Guidelines

This section provides guidelines for maintaining clean, maintainable code. Follow these principles to improve code quality and reduce technical debt.

### 1. Template Method Pattern

**When to use:** When multiple classes have similar methods with duplicate logic, but different values (like prompts).

**Principle:** Extract common logic into a template method in the base class. Subclasses provide only unique values and delegate execution.

**Example:**

```typescript
// ❌ BAD: Duplicate logic in each agent
class ArchitectAgent {
  async propose(problem: string): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Problem: ${problem}\n\nProvide architectural solution...`;
    const { text, usage, latencyMs } = await this.callLLM(system, user);
    const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
    if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
    return { content: text, metadata };
  }
}

// ✅ GOOD: Template method in base class
// Base Agent class
protected async proposeImpl(
  _context: DebateContext,
  systemPrompt: string,
  userPrompt: string
): Promise<Proposal> {
  const { text, usage, latencyMs } = await this.callLLM(systemPrompt, userPrompt);
  const metadata: ContributionMetadata = { latencyMs, model: this.config.model };
  if (usage?.totalTokens != null) metadata.tokensUsed = usage.totalTokens;
  return { content: text, metadata };
}

// Subclass only provides prompts
class ArchitectAgent {
  async propose(problem: string, context: DebateContext): Promise<Proposal> {
    const system = this.config.systemPrompt || ARCHITECT_SYSTEM_PROMPT;
    const user = `Problem: ${problem}\n\nProvide architectural solution...`;
    return this.proposeImpl(context, system, user);
  }
}
```

### 2. Remove Magic Numbers and Hardcoded Strings

**Principle:** Replace literal values with named constants that explain their purpose.

**Example:**

```typescript
// ❌ BAD: Magic numbers
const debateConfig = {
  rounds: options.rounds || config.rounds || 3,  // What is 3?
  timeout: 300000  // What is 300000?
};

// ✅ GOOD: Named constants
const DEFAULT_ROUNDS = 3;
const DEFAULT_TIMEOUT_MS = 300000;

const debateConfig = {
  rounds: options.rounds || config.rounds || DEFAULT_ROUNDS,
  timeout: DEFAULT_TIMEOUT_MS
};
```

**Where to define constants:**
- **File-level constants**: Use when only one file needs them
- **Exported constants**: Use when multiple files need them (in `types/` or `utils/` files)

### 3. Proper Documentation Standards

**JSDoc for public APIs:**
- Document all public functions, classes, and complex methods
- Include parameter descriptions (`@param`) and return types (`@returns`)
- Document errors thrown (`@throws`)
- Use `@final` tag for template methods that shouldn't be overridden

**Example:**

```typescript
/**
 * Creates a DebateConfig from the system configuration and command-line options.
 * Validates that the number of rounds is at least 1.
 *
 * @param sysConfig - The system configuration.
 * @param options - Command-line options containing optional rounds override.
 * @returns The debate configuration.
 * @throws {Error} If rounds is less than 1.
 */
function debateConfigFromSysConfig(sysConfig: SystemConfig, options: any): DebateConfig {
  // implementation
}
```

**Inline comments:** Explain **why**, not **what**. Document non-obvious technical choices.

### 4. Common Code Smells to Avoid

#### Unnecessary Exports

**Problem:** Exporting constants that are only accessed through methods.

```typescript
// ❌ BAD: Exports internal constant
export const DEFAULT_PERFORMANCE_SYSTEM_PROMPT = `...`;

// ✅ GOOD: Keep constant private, expose through method
const DEFAULT_PERFORMANCE_SYSTEM_PROMPT = `...`;
export class PerformanceAgent {
  static defaultSystemPrompt(): string {
    return DEFAULT_PERFORMANCE_SYSTEM_PROMPT;
  }
}
```

#### Inline Type Definitions (DRY Violation)

**Problem:** Repeating the same inline type definition multiple times.

```typescript
// ❌ BAD: Repeated inline type
function createAgent(promptSource?: { source: 'built-in' | 'file'; absPath?: string }) { }

// ✅ GOOD: Define once, reuse
export interface PromptSource {
  source: 'built-in' | 'file';
  absPath?: string;
}
function createAgent(promptSource?: PromptSource) { }
```

#### Repeated Code Patterns

**Problem:** The same logic pattern repeated 3+ times.

**Solution:** Extract to a helper function that can be reused.

#### Improper stdout/stderr Usage

**Principle:** stdout = data results, stderr = diagnostics/errors.

```typescript
// ❌ BAD: Diagnostic output on stdout
process.stdout.write(result.solution.description);
process.stdout.write('Debug info...');  // Should be stderr

// ✅ GOOD: Proper separation
process.stdout.write(result.solution.description);  // Main result
process.stderr.write('Debug info...');  // Diagnostics
```

#### Redundant Function Calls

**Problem:** Calling the same function multiple times with the same result.

```typescript
// ❌ BAD: Multiple calls
if (!fs.existsSync(finalPath)) {
  return builtInDefaults();  // Call 1
}
if (!parsed.judge) {
  parsed.judge = builtInDefaults().judge;  // Call 2
}

// ✅ GOOD: Call once, reuse
const defaults = builtInDefaults();  // Call once
if (!fs.existsSync(finalPath)) {
  return defaults;
}
if (!parsed.judge) {
  parsed.judge = defaults.judge;  // Reuse
}
```

#### Complex Nested Logic

**Problem:** Deeply nested loops and conditionals that are hard to read.

**Solution:** Extract to focused helper functions with single responsibilities.

### 5. Type Assertions Guidelines

**Use type assertions sparingly** and only when you have information TypeScript cannot infer.

**✅ Valid use cases:**
- Working with third-party libraries that return `any`
- Type narrowing after runtime validation
- Complex type transformations TypeScript struggles with

**❌ Avoid:**
- Hiding legitimate type errors
- Bypassing strict null checks
- Forcing incompatible types

**Before using `as Type`, consider:**
- Type guards: `if (typeof x === 'string')`
- Discriminated unions
- Conditional spreads: `...(value !== undefined && { value })`
- Proper typing: Fix the type definitions rather than casting

### 6. Code Cleanup Checklist

When reviewing or refactoring code, check:

- [ ] **No duplicate logic** - Extract common patterns to base classes or utilities
- [ ] **No magic numbers** - All literal numbers replaced with named constants
- [ ] **No hardcoded strings** - Especially for types, roles, statuses - use constants
- [ ] **All public APIs documented** - JSDoc for functions, classes, complex methods
- [ ] **Non-obvious choices explained** - Inline comments for "why" not "what"
- [ ] **Constants properly scoped** - File-level for local, exported for shared
- [ ] **Template methods marked @final** - When they shouldn't be overridden
- [ ] **Function extraction** - Large functions broken into smaller, focused ones
- [ ] **Separation of concerns** - Each function has a single, clear purpose
- [ ] **Proper stdout/stderr usage** - Results to stdout, diagnostics to stderr
- [ ] **No redundant calls** - Functions called once, results reused
- [ ] **No unnecessary exports** - Internal constants accessed through methods
- [ ] **No inline type repetition** - Types defined once, reused everywhere

### 7. Quick Reference

| Problem | Solution | Example |
|---------|----------|---------|
| Duplicate method logic | Template method pattern | `proposeImpl()` in base class |
| Magic number `3` | Named constant | `DEFAULT_ROUNDS = 3` |
| String `"architect"` | Constant object | `AGENT_ROLES.ARCHITECT` |
| Long complex function | Extract helper functions | `debateConfigFromSysConfig()` |
| Unclear technical choice | Inline comment | `// Use stderr.write for unbuffered output` |
| Public function | JSDoc with @param/@returns | See examples above |
| Repeated pattern 3+ times | Extract to helper function | `createAgentWithPromptResolution()` |

### Key Principles

Good code is:
- **DRY**: Don't Repeat Yourself - extract common patterns
- **Type-safe**: Let the compiler help you - avoid unnecessary `as` casts
- **Clear**: Easy to read and understand - self-documenting with good names
- **Focused**: Each function does one thing well - single responsibility
- **Consistent**: Follows established patterns - use the same approach throughout

**Remember:** If you copy-paste code, you're doing it wrong. Extract it to a reusable function or class.

## Testing Instructions

### Unit Testing

**Test Framework:** Jest with ts-jest preset

**Test File Location:** Tests are located in the `tests/` directory

**Test File Naming:** Test files should be named with `.spec.ts` suffix (e.g., `orchestrator.spec.ts`)

**Writing Tests:**

1. **Test Structure:**
   ```typescript
   import { Component } from '../src/component';
   
   describe('Component', () => {
     it('should do something specific', async () => {
       // Arrange
       const component = new Component();
       
       // Act
       const result = await component.method();
       
       // Assert
       expect(result).toBeDefined();
     });
   });
   ```

2. **Mocking:**
   - Mock external dependencies (LLM providers, file system)
   - Use Jest mocks for async operations
   - Create mock factories for complex objects (see `tests/orchestrator.spec.ts`)

3. **Test Coverage:**
   - Write tests for all public functions and methods
   - Test error cases and edge conditions
   - Test async operations with proper await handling
   - Test both success and failure paths

4. **Best Practices:**
   - Use descriptive test names that explain what is being tested
   - One assertion per test when possible
   - Clean up resources (mocks, temporary files) after tests
   - Use `beforeEach` and `afterEach` for test setup/teardown

**Example Test:**
```typescript
describe('DebateOrchestrator', () => {
  it('runs the correct phases for rounds=3 and calls judge synthesis', async () => {
    const agents = [createMockAgent('a1', 'architect')];
    const sm = createMockStateManager();
    const cfg: DebateConfig = {
      rounds: 3,
      terminationCondition: { type: 'fixed' },
      synthesisMethod: 'judge',
      includeFullHistory: true,
      timeoutPerRound: 300000,
    };

    const orchestrator = new DebateOrchestrator(agents, mockJudge, sm, cfg);
    const result = await orchestrator.runDebate('Design a caching system');
    
    expect(result).toBeDefined();
    expect(result.solution).toBeDefined();
  });
});
```

### Coverage Measurement

**Running Coverage:**
```bash
npm run test:coverage
```

**Coverage Goals:**
- Aim for minimum 80% code coverage across all metrics
- Focus on critical paths: orchestrator, agents, state management
- Ensure all error handling paths are tested

**Viewing Coverage:**
1. **HTML Report:** Open `coverage/lcov-report/index.html` in a browser
   - Navigate by file to see line-by-line coverage
   - Red lines indicate uncovered code
   - Yellow lines indicate partially covered branches

2. **Terminal Output:** Coverage summary is printed to console:
   ```
   File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
   ----------|---------|----------|---------|---------|-------------------
   All files |   85.42 |    78.57 |   82.14 |   85.42 |
   ```

3. **LCOV Format:** Use `coverage/lcov.info` for CI/CD integration

**Interpreting Coverage:**
- **Statements**: Percentage of executable statements covered
- **Branches**: Percentage of conditional branches covered (if/else, ternary)
- **Functions**: Percentage of functions called
- **Lines**: Percentage of lines executed

**Improving Coverage:**
- Identify uncovered files in the HTML report
- Add tests for missing branches and error cases
- Test edge conditions and boundary values
- Ensure all public API methods have tests

### Integration Testing

For integration tests that require actual API calls:
- Use test API keys (never commit real keys)
- Mock LLM providers in unit tests
- Use environment variables for test configuration
- Clean up test artifacts (debate files) after tests

## Security Considerations

### API Key Management

**Never commit API keys to version control:**
- API keys are stored in environment variables only
- `.env` file is gitignored (see `.gitignore`)
- Use `.env` files for local development, never commit them

**Environment Variables:**
- `OPENAI_API_KEY`: Required for OpenAI provider
- `OPENROUTER_API_KEY`: Required for OpenRouter provider

**Setting Environment Variables:**
- **Windows PowerShell:** `$Env:OPENAI_API_KEY = "sk-..."`
- **macOS/Linux:** `export OPENAI_API_KEY="sk-..."`
- **Using .env file:** Use `dotenv` package (already configured) to load from `.env`

**API Key Validation:**
- The system validates API keys are set before use
- Missing keys result in configuration errors (exit code 4)
- Keys are never logged or printed to console

### Input Validation

**Problem Descriptions:**
- Validate problem descriptions are non-empty
- Sanitize file paths to prevent directory traversal
- Validate file encoding (UTF-8 only)

**Configuration Files:**
- Validate JSON structure before parsing
- Validate configuration schema (agent IDs, roles, temperatures)
- Reject invalid configuration values with clear error messages

**File Paths:**
- Resolve relative paths safely
- Validate file existence before reading
- Prevent directory traversal attacks
- Use absolute paths for sensitive operations

### Data Security

**Debate State Files:**
- Debate state files may contain sensitive problem descriptions
- Store debate files in `debates/` directory (gitignored)
- Users should review debate files before sharing
- Consider encryption for sensitive debates in production

**Logging:**
- Never log API keys or sensitive credentials
- Avoid logging full problem descriptions in production
- Use structured logging with appropriate log levels

### Dependency Security

**Regular Updates:**
- Keep dependencies updated to patch vulnerabilities
- Use `npm audit` to check for known vulnerabilities
- Review security advisories for dependencies

**Checking for Vulnerabilities:**
```bash
npm audit
```

**Fixing Vulnerabilities:**
```bash
npm audit fix
```

For vulnerabilities that require manual intervention, review the advisory and update dependencies accordingly.

### Secure Coding Practices

**Type Safety:**
- Use TypeScript's type system to prevent runtime errors
- Validate external inputs (API responses, file contents)
- Use type guards for runtime type checking

**Error Handling:**
- Don't expose internal implementation details in error messages
- Log errors with appropriate detail levels
- Use exit codes for different error conditions

**File System:**
- Validate file paths before operations
- Use safe path resolution (avoid `../` traversal)
- Handle file system errors gracefully

**Network Security:**
- Use HTTPS for all API calls (enforced by OpenAI/OpenRouter SDKs)
- Validate API responses before processing
- Handle network errors and timeouts appropriately

### Recommendations

1. **Development:**
   - Use separate API keys for development and production
   - Rotate API keys regularly
   - Use environment variable management tools

2. **CI/CD:**
   - Store API keys in secure secrets management (GitHub Secrets, etc.)
   - Never hardcode API keys in CI/CD scripts
   - Use test API keys for automated tests

3. **Production:**
   - Use secret management services (AWS Secrets Manager, HashiCorp Vault)
   - Implement API key rotation policies
   - Monitor API usage for anomalies

4. **Code Review:**
   - Review all code for hardcoded secrets
   - Verify environment variable usage
   - Check for accidental credential logging

For more detailed security information, refer to the configuration documentation in `./docs/configuration.md`.

