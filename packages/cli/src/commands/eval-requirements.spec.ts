import {
  AGENT_ROLES,
  CONTRIBUTION_TYPES,
  DEBATE_STATUS,
  DebateState,
} from 'dialectic-core';

import { extractRequirementsInfo } from './eval-requirements';

function makeDebateState(partial: Partial<DebateState>): DebateState {
  return {
    id: 'deb-1',
    problem: 'Problem',
    status: DEBATE_STATUS.COMPLETED,
    currentRound: 1,
    rounds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as DebateState;
}

describe('extractRequirementsInfo', () => {
  it('infers major requirements from strong-language lines and strips bullet markers', () => {
    const debate = makeDebateState({
      problem: [
        '- Must support 10k concurrent users',
        '* should be fast (minor)',
        'Required: audit logging for all changes',
        'Nice to have: dark mode',
      ].join('\n'),
    });

    const out = extractRequirementsInfo(debate);
    expect(out.majorRequirements).toEqual([
      'Must support 10k concurrent users',
      'Required: audit logging for all changes',
    ]);
  });

  it('uses judge structured unfulfilledMajorRequirements and trims/filters empties', () => {
    const debate = makeDebateState({
      finalSolution: {
        description: 'x',
        tradeoffs: [],
        recommendations: [],
        confidence: 50,
        synthesizedBy: 'judge-1',
        unfulfilledMajorRequirements: ['  A  ', '', '   ', 'B'],
      },
    });

    const out = extractRequirementsInfo(debate);
    expect(out.judgeUnfulfilledRequirements).toEqual(['A', 'B']);
  });

  it('extracts Requirements Coverage from proposals and prefers later refinements per agent', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- R1 -> X\n',
              metadata: {},
            },
          ],
        },
        {
          roundNumber: 2,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: '## Requirements   Coverage\n\n- R1 -> Y\n',
              metadata: {},
            },
            {
              agentId: 'a2',
              agentRole: AGENT_ROLES.SECURITY,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- R2 -> Z\n',
              metadata: {},
            },
            {
              agentId: 'a3',
              agentRole: AGENT_ROLES.PERFORMANCE,
              type: CONTRIBUTION_TYPES.CRITIQUE,
              content: '## Requirements Coverage\n\n- should be ignored because critique\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);

    // Order isn't guaranteed (Map iteration over insert order by agent id insertion), so compare by agentId.
    const byAgent = Object.fromEntries(
      out.agentRequirementsCoverage.map((x) => [x.agentId, x.requirementsCoverage])
    );

    expect(byAgent.a1).toBe('- R1 -> Y');
    expect(byAgent.a2).toBe('- R2 -> Z');
    expect(byAgent.a3).toBeUndefined();
  });

  it('within the same round, prefers REFINEMENT over PROPOSAL for the same agent', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- old\n',
              metadata: {},
            },
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: '## Requirements Coverage\n\n- new\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- new');
  });

  it('extracts Requirements Coverage from real-world LLM-generated content', () => {
    // This tests the actual content structure from deb-20260101-204850-x1rv.json
    const realWorldContent = [
      '### Architecture Overview',
      'This solution proposes a microservices-based architecture...',
      '',
      '### Key Components',
      'Some content here...',
      '',
      '## Requirements Coverage',
      '',
      '**Major Requirements:**',
      '',
      '1.  **Interface with existing systems to automatically load reservations:**',
      '    *   **Covered by:** Reservation Aggregation Service. This service is explicitly designed to interact with external airline, hotel, and car rental systems via their APIs, using user credentials.',
      '2.  **Customers should be able to add existing reservations manually:**',
      '    *   **Covered by:** Reservation Aggregation Service. This service includes functionality for manual reservation input.',
      '3.  **Items grouped by trip and automatically removed when complete:**',
      '    *   **Covered by:** Trip Management Service.',
      '',
      '**Assumptions:**',
      '',
      '*   **External System APIs:** Assumed that the existing systems provide APIs.',
      '*   **User Credentials:** Assumed that users will provide credentials.',
      '',
      '**Confirmation:**',
      'All major requirements have been addressed by the proposed architecture.',
    ].join('\n');

    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-architect',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: realWorldContent,
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    expect(out.agentRequirementsCoverage[0]?.agentId).toBe('agent-architect');
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBeDefined();
    
    // The extracted content should include everything from "**Major Requirements:**" to the end
    const extracted = out.agentRequirementsCoverage[0]?.requirementsCoverage || '';
    expect(extracted).toContain('**Major Requirements:**');
    expect(extracted).toContain('Reservation Aggregation Service');
    expect(extracted).toContain('**Confirmation:**');
  });
});


