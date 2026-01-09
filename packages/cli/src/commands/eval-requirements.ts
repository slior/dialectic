import {
  Contribution,
  CONTRIBUTION_TYPES,
  DebateRound,
  DebateState,
  REQUIREMENTS_COVERAGE_SECTION_TITLE,
  writeStderr,
} from 'dialectic-core';

export type AgentRequirementsCoverage = {
  agentId: string;
  agentRole: string;
  requirementsCoverage?: string;
};

type AgentCoverageSelection = {
  roundNumber: number;
  phase: Contribution['type'];
  entry: AgentRequirementsCoverage;
};

type CoverageByAgentId = Map<string, AgentCoverageSelection>;

export type RequirementsInfo = {
  majorRequirements: string[];
  judgeUnfulfilledRequirements: string[];
  agentRequirementsCoverage: AgentRequirementsCoverage[];
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MIN_REQUIREMENT_LENGTH = 10;

const REQUIREMENTS_COVERAGE_SECTION_REGEX: RegExp = ((): RegExp => {
  // Source the title from core prompts to avoid hardcoding / drift between prompt + parser.
  const sectionTitlePattern = REQUIREMENTS_COVERAGE_SECTION_TITLE
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s*');

  return new RegExp(`#+\\s*${sectionTitlePattern}\\s*\\n+([\\s\\S]*?)(?=\\n##|\\n---|$)`, 'i');
})();

/**
 * Updates or inserts an agent's requirements coverage from a contribution into the provided map.
 *
 * This function parses the 'Requirements Coverage' section from a given contribution's content
 * (using a regex bounded by the requirements section title), and stores the relevant information
 * for the agent in the map, using the agent's ID as the key.
 *
 * The function prefers coverage from later rounds and, within the same round, favors REFINEMENT
 * over PROPOSAL phases. For the same agent and same round/phase, the current call will replace the previous.
 *
 * @param contribution - The agent's contribution containing potential requirements coverage.
 * @param roundNumber - The debate round number for context.
 * @param coverageByAgentId - Map to update, keyed by agent id, with each agent's coverage selection.
 */
function upsertRequirementsCoverageFromContribution( contribution: Contribution, roundNumber: number, coverageByAgentId: CoverageByAgentId ): void {
  const coverageMatch = contribution.content.match(REQUIREMENTS_COVERAGE_SECTION_REGEX);
  if (!coverageMatch?.[1]) {
    // Proposals are instructed (via shared prompts) to include a Requirements Coverage section.
    // Logging this helps diagnose prompt drift / non-compliant model outputs.
    if (contribution.type === CONTRIBUTION_TYPES.PROPOSAL || contribution.type === CONTRIBUTION_TYPES.REFINEMENT) {
      writeStderr(
        `[${contribution.agentId}] No "${REQUIREMENTS_COVERAGE_SECTION_TITLE}" section found in ${contribution.type} (round ${roundNumber}); skipping requirements extraction for this contribution\n`
      );
    }
    return;
  }

  const next: AgentCoverageSelection = {
    roundNumber,
    phase: contribution.type,
    entry: {
      agentId: contribution.agentId,
      agentRole: contribution.agentRole,
      requirementsCoverage: coverageMatch[1].trim(),
    },
  };

  const prev = coverageByAgentId.get(contribution.agentId);
  if (!prev) {
    coverageByAgentId.set(contribution.agentId, next);
    return;
  }

  if (roundNumber > prev.roundNumber) {
    coverageByAgentId.set(contribution.agentId, next);
    return;
  }

  if (roundNumber < prev.roundNumber) {
    return;
  }

  // Same round: prefer refinement over proposal. For same phase, keep the later one (current loop order).
  if (next.phase === CONTRIBUTION_TYPES.REFINEMENT || prev.phase !== CONTRIBUTION_TYPES.REFINEMENT) {
    coverageByAgentId.set(contribution.agentId, next);
  }
}

/**
 * Collects and updates requirements coverage information for agents from a debate round.
 *
 * This function iterates through all contributions in the given debate round and, for each
 * contribution that is a PROPOSAL or REFINEMENT, attempts to extract and upsert any
 * requirements coverage found in its content.
 *
 * The extracted coverage for each agent is accumulated in the provided coverageByAgentId map,
 * keyed by agent id. Only contributions with non-empty content are considered.
 *
 * @param round - The debate round containing contributions to process.
 * @param coverageByAgentId - The map to update with requirements coverage, keyed by agent id.
 */
function collectRequirementsCoverageFromRound(round: DebateRound, coverageByAgentId: CoverageByAgentId): void {
  if (!round?.contributions?.length) return;

  for (const contribution of round.contributions) {
    if (!contribution?.content) continue;
    const isProposalOrRefinement =
      contribution.type === CONTRIBUTION_TYPES.PROPOSAL ||
      contribution.type === CONTRIBUTION_TYPES.REFINEMENT;

    if (isProposalOrRefinement) {
      upsertRequirementsCoverageFromContribution(contribution, round.roundNumber, coverageByAgentId);
    }
  }
}

/**
 * Infers a list of major requirements from a problem statement text.
 *
 * This function analyzes each line of the provided problem description,
 * extracting those that appear to indicate a major requirement. A line
 * is considered to describe a major requirement if it contains one of a
 * set of predefined keywords (e.g., "must", "shall", "required", etc.)
 * and is at least 10 characters long after trimming.
 *
 * Bullet points and common list indicators (e.g., "-", "*", "•") at the
 * start of a line are removed prior to further analysis.
 *
 * @param problem - The problem statement as a string (potentially multi-line).
 * @returns An array of strings, each representing a major requirement inferred from the input.
 */
export function inferMajorRequirements(problem: string): string[] {
  const requirements: string[] = [];
  const majorKeywords = ['must', 'shall', 'required', 'needs to', 'critical', 'essential'];
  const lines = problem.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lowerLine = trimmed.toLowerCase();
    const hasMajorKeyword = majorKeywords.some((keyword) => lowerLine.includes(keyword));

    if (hasMajorKeyword) {
      const cleaned = trimmed.replace(/^[-*•]\s*/, '').trim();
      if (cleaned && cleaned.length > MIN_REQUIREMENT_LENGTH) {
        requirements.push(cleaned);
      }
    }
  }

  return requirements;
}

/**
 * Extracts key requirements information from a DebateState object.
 *
 * This function performs a comprehensive extraction of requirements-related data from a debate's state,
 * aggregating output from different sources:
 * 
 * 1. **Major Requirements Inference**: Uses the debate's problem statement to infer a list of major requirements likely expected of any final solution.
 * 2. **Judge Unfulfilled Major Requirements**: Retrieves the judge's explicit enumeration of any major requirements deemed unfulfilled in the final solution (if available).
 * 3. **Agent Requirements Coverage**: Compiles, for each agent, the best-effort coverage of requirements as expressed in their proposals or refinements, organized by agent ID.
 * 
 * @param debate - The DebateState object representing the full debate, including problem statement, rounds, and final solution.
 * @returns {RequirementsInfo} An object containing:
 *    - `majorRequirements`: Array of strings representing major requirements inferred from the problem statement.
 *    - `judgeUnfulfilledRequirements`: Array of strings listing judge-labeled unfulfilled major requirements.
 *    - `agentRequirementsCoverage`: Array of objects detailing each agent's requirements coverage throughout the debate.
 */
export function extractRequirementsInfo(debate: DebateState): RequirementsInfo {
  const majorRequirements = inferMajorRequirements(debate.problem);

  const judgeUnfulfilledRequirements: string[] = Array.isArray(debate.finalSolution?.unfulfilledMajorRequirements)
    ? debate.finalSolution!.unfulfilledMajorRequirements.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  const coverageByAgentId: CoverageByAgentId = new Map();
  if (Array.isArray(debate.rounds)) {
    debate.rounds.forEach((round) => collectRequirementsCoverageFromRound(round, coverageByAgentId));
  }

  const agentRequirementsCoverage: AgentRequirementsCoverage[] = Array.from(coverageByAgentId.values()).map((v) => v.entry);

  return {
    majorRequirements,
    judgeUnfulfilledRequirements,
    agentRequirementsCoverage,
  };
}


