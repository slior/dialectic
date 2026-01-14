import {
  AGENT_ROLES,
  CONTRIBUTION_TYPES,
  DEBATE_STATUS,
  DebateState,
} from 'dialectic-core';

import { extractRequirementsInfo, inferMajorRequirements } from './eval-requirements';

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

  it('handles missing rounds array', () => {
    const debate = makeDebateState({});
    // Manually set rounds to undefined to test edge case
    (debate as { rounds?: unknown }).rounds = undefined;

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
  });

  it('handles empty rounds array', () => {
    const debate = makeDebateState({
      rounds: [],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
  });

  it('handles missing finalSolution', () => {
    const debate = makeDebateState({});
    // Manually set finalSolution to undefined to test edge case
    (debate as { finalSolution?: unknown }).finalSolution = undefined;

    const out = extractRequirementsInfo(debate);
    expect(out.judgeUnfulfilledRequirements).toEqual([]);
  });

  it('handles finalSolution without unfulfilledMajorRequirements', () => {
    const debate = makeDebateState({
      finalSolution: {
        description: 'x',
        tradeoffs: [],
        recommendations: [],
        confidence: 50,
        synthesizedBy: 'judge-1',
      },
    });

    const out = extractRequirementsInfo(debate);
    expect(out.judgeUnfulfilledRequirements).toEqual([]);
  });

  it('handles non-array unfulfilledMajorRequirements', () => {
    const debate = makeDebateState({
      finalSolution: {
        description: 'x',
        tradeoffs: [],
        recommendations: [],
        confidence: 50,
        synthesizedBy: 'judge-1',
        unfulfilledMajorRequirements: 'not an array' as unknown as string[],
      },
    });

    const out = extractRequirementsInfo(debate);
    expect(out.judgeUnfulfilledRequirements).toEqual([]);
  });

  it('handles rounds with empty contributions array', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
  });

  it('handles rounds with null contributions', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: null as unknown as [],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
  });

  it('handles contributions without content', () => {
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
              content: '',
              metadata: {},
            },
            {
              agentId: 'a2',
              agentRole: AGENT_ROLES.SECURITY,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: null as unknown as string,
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
  });

  it('logs warning when PROPOSAL lacks Requirements Coverage section', () => {
    // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const writeStderrSpy = jest.spyOn(require('dialectic-core'), 'writeStderr').mockImplementation(() => {});

    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: 'Some content without Requirements Coverage section',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
    expect(writeStderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[agent-1] No "Requirements Coverage" section found in proposal')
    );

    writeStderrSpy.mockRestore();
  });

  it('logs warning when REFINEMENT lacks Requirements Coverage section', () => {
    // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const writeStderrSpy = jest.spyOn(require('dialectic-core'), 'writeStderr').mockImplementation(() => {});

    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 2,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-2',
              agentRole: AGENT_ROLES.SECURITY,
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: 'Some refinement content without Requirements Coverage',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toEqual([]);
    expect(writeStderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[agent-2] No "Requirements Coverage" section found in refinement')
    );

    writeStderrSpy.mockRestore();
  });

  it('does not log warning for CRITIQUE without Requirements Coverage section', () => {
    // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const writeStderrSpy = jest.spyOn(require('dialectic-core'), 'writeStderr').mockImplementation(() => {});

    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'agent-3',
              agentRole: AGENT_ROLES.PERFORMANCE,
              type: CONTRIBUTION_TYPES.CRITIQUE,
              content: 'Some critique content',
              metadata: {},
            },
          ],
        },
      ],
    });

    extractRequirementsInfo(debate);
    expect(writeStderrSpy).not.toHaveBeenCalled();

    writeStderrSpy.mockRestore();
  });

  it('prefers later round over earlier round for same agent', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 2,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- Round 2 content\n',
              metadata: {},
            },
          ],
        },
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- Round 1 content\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- Round 2 content');
  });

  it('keeps earlier round when processing later round with lower round number', () => {
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 3,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- Round 3 content\n',
              metadata: {},
            },
          ],
        },
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- Round 1 content\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    // Round 3 should be kept, Round 1 should be ignored (roundNumber < prev.roundNumber)
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- Round 3 content');
  });

  it('handles Requirements Coverage section with different markdown heading levels', () => {
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
              content: '### Requirements Coverage\n\n- Content with ###\n',
              metadata: {},
            },
            {
              agentId: 'a2',
              agentRole: AGENT_ROLES.SECURITY,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '# Requirements Coverage\n\n- Content with #\n',
              metadata: {},
            },
            {
              agentId: 'a3',
              agentRole: AGENT_ROLES.PERFORMANCE,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '#### Requirements Coverage\n\n- Content with ####\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(3);
    const byAgent = Object.fromEntries(
      out.agentRequirementsCoverage.map((x) => [x.agentId, x.requirementsCoverage])
    );
    expect(byAgent.a1).toBe('- Content with ###');
    expect(byAgent.a2).toBe('- Content with #');
    expect(byAgent.a3).toBe('- Content with ####');
  });

  it('handles Requirements Coverage section ending at document end', () => {
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
              content: '## Requirements Coverage\n\n- Final content\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- Final content');
  });

  it('trims whitespace from extracted Requirements Coverage content', () => {
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
              content: '## Requirements Coverage\n\n   \n  - Content with spaces  \n  \n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    // The content is trimmed by the code (line 79: coverageMatch[1].trim())
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- Content with spaces');
  });

  it('keeps previous REFINEMENT when same round has PROPOSAL after REFINEMENT', () => {
    // This tests the branch where prev.phase === REFINEMENT and next.phase !== REFINEMENT
    // In this case, the condition on line 99 is false, so we don't update
    const debate = makeDebateState({
      rounds: [
        {
          roundNumber: 1,
          timestamp: new Date(),
          contributions: [
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.REFINEMENT,
              content: '## Requirements Coverage\n\n- Refinement content\n',
              metadata: {},
            },
            {
              agentId: 'a1',
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: '## Requirements Coverage\n\n- Proposal content\n',
              metadata: {},
            },
          ],
        },
      ],
    });

    const out = extractRequirementsInfo(debate);
    expect(out.agentRequirementsCoverage).toHaveLength(1);
    // REFINEMENT should be kept, PROPOSAL should be ignored (prev.phase === REFINEMENT, next.phase !== REFINEMENT)
    expect(out.agentRequirementsCoverage[0]?.requirementsCoverage).toBe('- Refinement content');
  });
});

describe('inferMajorRequirements', () => {
  it('returns empty array for empty problem', () => {
    expect(inferMajorRequirements('')).toEqual([]);
  });

  it('returns empty array for problem with only whitespace', () => {
    expect(inferMajorRequirements('   \n  \n  ')).toEqual([]);
  });

  it('extracts requirements with "must" keyword', () => {
    const problem = 'The system must handle 1000 requests per second';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['The system must handle 1000 requests per second']);
  });

  it('extracts requirements with "shall" keyword', () => {
    const problem = 'The system shall support authentication';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['The system shall support authentication']);
  });

  it('extracts requirements with "required" keyword', () => {
    const problem = 'Audit logging is required for compliance';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['Audit logging is required for compliance']);
  });

  it('extracts requirements with "needs to" keyword', () => {
    const problem = 'The API needs to be RESTful';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['The API needs to be RESTful']);
  });

  it('extracts requirements with "critical" keyword', () => {
    const problem = 'Data encryption is critical for security';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['Data encryption is critical for security']);
  });

  it('extracts requirements with "essential" keyword', () => {
    const problem = 'Error handling is essential for reliability';
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['Error handling is essential for reliability']);
  });

  it('extracts multiple requirements from multi-line problem', () => {
    const problem = [
      'The system must be scalable',
      'It shall support horizontal scaling',
      'Performance is critical',
      'Security is essential',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(4);
    expect(result).toContain('The system must be scalable');
    expect(result).toContain('It shall support horizontal scaling');
    expect(result).toContain('Performance is critical');
    expect(result).toContain('Security is essential');
  });

  it('strips bullet point markers (-, *, •)', () => {
    const problem = [
      '- Must support 10k users',
      '* Shall be fast',
      '• Required: audit logging',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toEqual([
      'Must support 10k users',
      'Shall be fast',
      'Required: audit logging',
    ]);
  });

  it('strips bullet markers with spaces', () => {
    const problem = [
      '-   Must support 10k users',
      '*  Shall be fast',
      '•   Required: audit logging',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toEqual([
      'Must support 10k users',
      'Shall be fast',
      'Required: audit logging',
    ]);
  });

  it('filters out requirements shorter than 10 characters', () => {
    const problem = [
      'Must be',
      'Shall do',
      'Required: long enough requirement text',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['Required: long enough requirement text']);
  });

  it('handles case-insensitive keyword matching', () => {
    const problem = [
      'MUST be scalable',
      'SHALL support auth',
      'REQUIRED: logging',
      'Critical feature',
      'ESSENTIAL component',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(5);
  });

  it('handles keywords in middle of sentence', () => {
    const problem = [
      'The system architecture must support microservices',
      'This component shall be stateless',
      'Data persistence is required for state management',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(3);
  });

  it('handles empty lines between requirements', () => {
    const problem = [
      'Must support 10k users',
      '',
      'Shall be fast',
      '  ',
      'Required: audit logging',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(3);
  });

  it('handles lines without keywords', () => {
    const problem = [
      'This is a regular line',
      'Must support 10k users',
      'Another regular line',
      'Shall be fast',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(2);
    expect(result).toContain('Must support 10k users');
    expect(result).toContain('Shall be fast');
  });

  it('handles requirements with bullet markers that become too short after stripping', () => {
    const problem = [
      '- Must',
      '- Must support 10k concurrent users',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toEqual(['Must support 10k concurrent users']);
  });

  it('preserves original case of requirement text', () => {
    const problem = [
      'MUST support 10K users',
      'Shall Be Fast',
      'Required: Audit Logging',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toEqual([
      'MUST support 10K users',
      'Shall Be Fast',
      'Required: Audit Logging',
    ]);
  });

  it('handles requirements with multiple keywords', () => {
    const problem = [
      'The system must be required to be fast',
      'It shall be critical and essential',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    expect(result).toHaveLength(2);
  });

  it('handles requirements ending with keywords', () => {
    const problem = [
      'The system performance must',
      'Security is critical',
    ].join('\n');
    const result = inferMajorRequirements(problem);
    // "The system performance must" is 28 chars, should be included
    expect(result).toContain('The system performance must');
    expect(result).toContain('Security is critical');
  });
});


