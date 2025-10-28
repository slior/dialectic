Evaluate the following debate outcome.

Problem:
"""
{problem}
"""

Clarifications (if any):
{clarifications}

Final Solution Description:
"""
{final_solution}
"""

Return ONLY a single JSON object matching this schema:
{
  "evaluation": {
    "functional_completeness": {
      "score": <integer 1..10>,
      "reasoning": "<string>"
    },
    "non_functional": {
      "performance_scalability": { "score": <integer 1..10>, "reasoning": "<string>" },
      "security": { "score": <integer 1..10>, "reasoning": "<string>" },
      "maintainability_evolvability": { "score": <integer 1..10>, "reasoning": "<string>" },
      "regulatory_compliance": { "score": <integer 1..10>, "reasoning": "<string>" },
      "testability": { "score": <integer 1..10>, "reasoning": "<string>" }
    }
  },
  "overall_summary": {
    "strengths": "<brief strengths>",
    "weaknesses": "<brief weaknesses>",
    "overall_score": <integer 1..10>
  }
}

Rules:
- Scores MUST be integers between 1 and 10.
- If you cannot provide a score for a field, omit that field instead of guessing.
- Output ONLY the JSON object. Do not wrap it in code fences.


