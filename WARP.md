# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Setup and prerequisites
- Node.js >= 18
- macOS/zsh (set OpenAI key):
  ```sh
  export OPENAI_API_KEY="{{OPENAI_API_KEY}}"
  ```
- Install dependencies:
  ```sh
  npm install
  ```

## Common commands
- Build
  ```sh
  npm run build
  ```
- Lint
  - No linter configured in this repo (no eslint/prettier config or npm scripts).
- Tests
  - All tests
    ```sh
    npm test
    ```
  - Watch mode
    ```sh
    npm run test:watch
    ```
  - Coverage
    ```sh
    npm run test:coverage
    ```
  - Single test file
    ```sh
    npx jest tests/<file>.spec.ts
    # example:
    npx jest tests/orchestrator.spec.ts
    ```
  - Single test by name
    ```sh
    npx jest -t "<test name substring>"
    ```
- Run the CLI during development (TypeScript, full command)
  ```sh
  # Inline problem text
  npx ts-node src/cli/index.ts debate "Design a rate limiting system"

  # File-based problem
  npx ts-node src/cli/index.ts debate --problemDescription path/to/problem.txt

  # Verbose and output examples
  npx ts-node src/cli/index.ts debate "Design a rate limiting system" --verbose
  npx ts-node src/cli/index.ts debate "Design a rate limiting system" --output result.json
  npx ts-node src/cli/index.ts debate "Design a rate limiting system" --output solution.txt
  ```
- Run the built JavaScript CLI (after build)
  ```sh
  node dist/cli/index.js debate "Design a rate limiting system"
  node dist/cli/index.js debate --problemDescription path/to/problem.txt --verbose
  node dist/cli/index.js debate "Design a rate limiting system" --output result.json
  node dist/cli/index.js debate "Design a rate limiting system" --output solution.txt
  ```

## Architecture overview
- CLI layer
  - `src/cli/index.ts` bootstraps Commander, registers the `debate` command, and centralizes stderr helpers (warnUser, infoUser, writeStderr). The published binary is `debate` (see package.json `bin`).
- Debate command flow
  - `src/cli/commands/debate.ts` parses args, enforces exactly-one of problem string vs `--problemDescription`, validates `OPENAI_API_KEY`, loads `SystemConfig` (defaults if missing/incomplete with warnings), filters agents, resolves system prompts (built-in vs file), records provenance, runs the orchestrator, and handles output.
- Providers
  - `src/providers/openai-provider.ts` exposes `complete()` with a two-tier strategy: OpenAI Responses API first, falling back to Chat Completions. Returns text, usage, and latency for contribution metadata.
- Agents and Judge
  - Role agents live under `src/agents/` and extend the base in `src/core/agent.ts`. The judge (`src/core/judge.ts`) synthesizes the final solution after all rounds complete.
- Orchestration
  - `src/core/orchestrator.ts` runs N full rounds: proposal → critique → refinement (all three every round), then judge synthesis. Optional hooks log phase completion in verbose mode.
- State persistence
  - `src/core/state-manager.ts` persists debate state JSON files under `./debates` after initialization, at round start, after each contribution, and on completion.
- Output behavior
  - By default, final solution text is written to stdout. If `--output` ends with `.json`, the full debate state is written; otherwise only the solution text. Verbose summaries and save-path notices go to stderr (pipe-friendly).

## Configuration essentials
- Full schema and defaults: see `docs/configuration.md`.
- Default config path: `./debate-config.json` (resolved from current working directory).
- If agents are missing/empty → built-in defaults are used (architect + performance) with warnings.
- If judge/debate missing → they are filled from defaults (warning for judge).
- `systemPromptPath` is resolved relative to the configuration file’s directory; if invalid/empty/unreadable, the built-in prompt is used and the chosen source is recorded once per debate.
- Environment requirement: `OPENAI_API_KEY` must be set before invoking the CLI.

## Execution flow at a glance
- High-level steps (details and diagram in `docs/debate_flow.md`):
  1) CLI parses arguments and resolves the problem (string or file)
  2) Validates `OPENAI_API_KEY` and loads `SystemConfig`
  3) Initializes provider, agents, and judge (with prompt provenance)
  4) Orchestrator runs N rounds: proposal → critique → refinement (all three per round)
  5) Judge synthesizes the final solution
  6) State is saved throughout under `./debates/<debate-id>.json`
  7) Output written to stdout or a file per `--output`

## Debugging and logs
- Saved debate path is written to stderr: `Saved debate to ./debates/<debate-id>.json`
- Use `--verbose` for round-by-round summaries (to stderr), including latency and token stats when available.
- Tests mock OpenAI; use `npm test` for fast iterations.
- Git commit graph (if you use a global alias):
  ```sh
  git tree --all --decorate --oneline
  ```

## References
- `README.md` (CLI usage, options, exit codes)
- `docs/configuration.md` (complete configuration schema and defaults)
- `docs/debate_flow.md` (sequence diagram and deeper flow)