# Evaluator Command

The `eval` command runs one or more evaluator agents to assess the outcome of a completed debate stored as a debate state JSON file.

## Usage

```bash
# Basic usage (stdout Markdown table by default)
dialectic eval --config ./eval-config.json --debate ./debates/deb-20250101-010203-ABC.json

# With environment file and verbose diagnostics
dialectic eval --config ./eval-config.json --debate ./deb.json --env-file ./.env --verbose

# Write aggregated JSON output
dialectic eval --config ./eval-config.json --debate ./deb.json --output ./result.json
```

Options:
- `-c, --config <path>`: Required. Evaluator configuration file path.
- `-d, --debate <path>`: Required. Debate JSON (saved `DebateState`) file path.
- `--env-file <path>`: Optional. Path to environment file.
- `-v, --verbose`: Optional. Verbose diagnostic output to stderr.
- `-o, --output <path>`: Optional. Output destination.
  - If path ends with `.json`, writes aggregated JSON output (including per-agent results).
  - Otherwise, writes a Markdown table (or stdout when not provided).

Exit codes:
- `0`: Success
- `2`: Invalid arguments (missing files/fields, malformed JSON, missing final solution)
- `4`: Configuration error (e.g., missing API keys)

## Evaluator Configuration

Schema (root):
```json
{
  "agents": [
    {
      "id": "eval-1",
      "name": "Evaluator 1",
      "model": "gpt-4",
      "provider": "openai",
      "systemPromptPath": "./prompts/system.md",
      "userPromptPath": "./prompts/user.md",
      "timeout": 30000,
      "enabled": true
    }
  ]
}
```

Notes:
- `role` is not required.
- `temperature` is ignored; evaluators always use temperature 0.1.
- `timeout` units: milliseconds. Default 30000.

## Input Debate JSON
- Must contain non-empty `problem` and `finalSolution.description`.
- If missing, the command fails with exit code 2.
- Clarifications (if any) are included in the evaluator context as fenced code blocks; skipped answers appear as `NA`.

## Default Prompts
Built-in prompts are bundled in the code and used if files are missing/invalid:
- `src/eval/prompts/system.md`
- `src/eval/prompts/user.md`

## Evaluator Output Contract
Evaluators must return ONLY a JSON object with this structure:
```json
{
  "evaluation": {
    "functional_completeness": { "score": 1, "reasoning": "..." },
    "non_functional": {
      "performance_scalability": { "score": 1, "reasoning": "..." },
      "security": { "score": 1, "reasoning": "..." },
      "maintainability_evolvability": { "score": 1, "reasoning": "..." },
      "regulatory_compliance": { "score": 1, "reasoning": "..." },
      "testability": { "score": 1, "reasoning": "..." }
    }
  },
  "overall_summary": {
    "strengths": "...",
    "weaknesses": "...",
    "overall_score": 1
  }
}
```

Rules:
- Scores must be integers in the range 1..10.
- If a score is unavailable, omit that field; the system averages only present values and warns.
- Out-of-range scores are clamped to [1..10] with a warning.
- Non-numeric scores are ignored with a warning.
- Extra keys are ignored (warned in verbose mode).

## Aggregation and Output
- Categories averaged:
  - Functional Completeness
  - Performance & Scalability
  - Security
  - Maintainability & Evolvability
  - Regulatory Compliance
  - Testability
  - Overall Score
- Averaging uses only present, valid scores; results are rounded to 2 decimals. Missing across all agents displays `N/A`.

### Markdown Output
A single Markdown table is printed to stdout by default:
```
| Functional Completeness | Performance & Scalability | Security | Maintainability & Evolvability | Regulatory Compliance | Testability | Overall Score |
|------------------------|---------------------------|----------|-------------------------------|------------------------|------------|---------------|
| 7.50 | 6.00 | 8.00 | 7.00 | N/A | 7.00 | 7.20 |
```

### JSON Output
When `--output` ends with `.json`, the file contains averages and per-agent results:
```json
{
  "evaluation": {
    "functional_completeness": { "average_score": 7.5 },
    "non_functional": {
      "performance_scalability": { "average_score": 6.0 },
      "security": { "average_score": 8.0 },
      "maintainability_evolvability": { "average_score": 7.0 },
      "regulatory_compliance": { "average_score": null },
      "testability": { "average_score": 7.0 }
    }
  },
  "overall_score": 7.2,
  "agents": {
    "eval-1": {}
  }
}
```

## Verbose Mode
With `--verbose`, stderr includes:
- Provider/model per agent
- Prompt sources (built-in vs file path)
- Per-agent latency and any timeout
- JSON parsing/clamping/ignored-field warnings
