Evaluate the following debate outcome in terms of the software design’s quality and soundness.

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

Requirements Information:
{requirements_info}

In your evaluation, focus on:
- How well the solution satisfies the problem requirements and constraints.
- How clearly and convincingly it discusses or justifies trade-offs.
- Whether it acknowledges potential risks, limitations, or missing elements.
- The realism and implementability of the design decisions.

## Requirements Fulfillment Assessment

You MUST assess requirements fulfillment using the Requirements Information provided above. Note that:
- The major requirements listed are heuristically extracted from the problem statement; you should validate them against the actual problem.
- Requirements Coverage sections from agent proposals may not exist (older debates) or may be incomplete.
- Judge's unfulfilled requirements may not be available if the judge output was not in JSON format.

Evaluate the following aspects:

1. **Requirements Identification**: Review the problem statement and validate the inferred major requirements. Identify any additional major requirements that may have been missed.

2. **Requirements Coverage**: Evaluate whether the final solution explicitly addresses each major requirement. Check if:
   - The solution describes how each requirement is fulfilled
   - Components or mechanisms are mapped to specific requirements
   - Any requirements are missing or inadequately addressed

3. **Requirements Traceability**: Assess whether:
   - Requirements can be traced from problem statement → solution components
   - The solution provides clear mapping between requirements and design decisions
   - Assumptions about requirements are explicitly stated

4. **Judge Assessment Accuracy**: If the judge identified unfulfilled major requirements, evaluate whether:
   - The judge's assessment is accurate
   - The identified gaps are legitimate concerns
   - The solution could be improved to address these gaps

Score the `requirements_fulfillment` metric (1-10) based on the above assessment.

Return ONLY a single JSON object matching this schema:
{
  "evaluation": {
    "functional_completeness": {
      "score": <integer 1..10>,
      "reasoning": "<string>"
    },
    "non_functional": {
      "performance_scalability": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      },
      "security": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      },
      "maintainability_evolvability": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      },
      "regulatory_compliance": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      },
      "testability": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      },
      "requirements_fulfillment": {
        "score": <integer 1..10>,
        "reasoning": "<string>"
      }
    }
  },
  "overall_summary": {
    "strengths": "<brief strengths>",
    "weaknesses": "<brief weaknesses>",
    "overall_score": <integer 1..10>
  }
}

Rules:
- Be concise but specific in reasoning; avoid generic praise such as “looks good”.
- Highlight gaps, contradictions, implicit assumptions, or missing aspects wherever they appear.
- Scores must be integers between 1 and 10.
- Provide a score for every metric in the schema. If information is missing or ambiguous, make a best-effort estimate and be explicit about uncertainty in the reasoning (bias toward lower scores when uncertain).
- Output only the JSON object. Do not wrap it in code fences.
