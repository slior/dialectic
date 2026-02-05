import { AgentConfig, AgentRole, AGENT_ROLES, LLM_PROVIDERS } from '../types/agent.types';
import {
  DebateState,
  Contribution,
  CONTRIBUTION_TYPES,
  DebateRound,
  Solution,
  AgentClarifications,
  DEBATE_STATUS,
} from '../types/debate.types';

import { generateDebateReport } from './report-generator';

// Test constants
const TEST_AGENT_ID = 'agent-1';
const TEST_AGENT_NAME = 'Test Agent';
const TEST_AGENT_ROLE = AGENT_ROLES.ARCHITECT;
const TEST_MODEL = 'gpt-4';
const TEST_PROVIDER = LLM_PROVIDERS.OPENAI;
const TEST_TEMPERATURE = 0.5;
const TEST_JUDGE_ID = 'judge-1';
const TEST_JUDGE_NAME = 'Test Judge';
const TEST_PROBLEM_DESCRIPTION = 'Design a caching system';
const TEST_DEBATE_ID = 'debate-1';

/**
 * Creates a minimal agent configuration for testing.
 */
function createAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: TEST_AGENT_ID,
    name: TEST_AGENT_NAME,
    role: TEST_AGENT_ROLE,
    model: TEST_MODEL,
    provider: TEST_PROVIDER,
    temperature: TEST_TEMPERATURE,
    ...overrides,
  };
}

/**
 * Creates a minimal judge configuration for testing.
 */
function createJudgeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: TEST_JUDGE_ID,
    name: TEST_JUDGE_NAME,
    role: AGENT_ROLES.GENERALIST,
    model: TEST_MODEL,
    provider: TEST_PROVIDER,
    temperature: 0.3,
    ...overrides,
  };
}

/**
 * Creates a minimal contribution for testing.
 */
function createContribution(
  type: typeof CONTRIBUTION_TYPES[keyof typeof CONTRIBUTION_TYPES],
  overrides?: Partial<Contribution>
): Contribution {
  return {
    agentId: TEST_AGENT_ID,
    agentRole: TEST_AGENT_ROLE,
    type,
    content: `${type} content`,
    metadata: {},
    ...overrides,
  };
}

/**
 * Creates a minimal debate round for testing.
 */
function createDebateRound(roundNumber: number, contributions: Contribution[] = []): DebateRound {
  return {
    roundNumber,
    contributions,
    timestamp: new Date('2024-01-01T12:00:00Z'),
  };
}

/**
 * Creates a minimal debate state for testing.
 */
function createDebateState(overrides?: Partial<DebateState>): DebateState {
  const state = new DebateState();
  state.id = TEST_DEBATE_ID;
  state.problem = TEST_PROBLEM_DESCRIPTION;
  state.status = DEBATE_STATUS.COMPLETED;
  state.currentRound = 1;
  state.rounds = [];
  state.createdAt = new Date('2024-01-01T12:00:00Z');
  state.updatedAt = new Date('2024-01-01T12:00:00Z');
  if (overrides) {
    Object.assign(state, overrides);
  }
  return state;
}

describe('report-generator', () => {
  describe('generateDebateReport', () => {
    it('should generate a basic report with minimal data', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('# Debate: Design a caching system');
      expect(report).toContain('## Problem Description');
      expect(report).toContain('## Agents');
      expect(report).toContain('## Judge');
      expect(report).toContain('## Rounds');
      expect(report).toContain('### Final Synthesis');
    });

    it('should include formatted timestamp in report', () => {
      const debateState = createDebateState({
        createdAt: new Date('2024-01-15T14:30:45Z'),
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toMatch(/Time: 2024-01-15 \d{2}:\d{2}:\d{2}/);
    });

    it('should extract first line from problem description for title', () => {
      const multiLineProblem = 'Design a caching system\n\nWith multiple lines\nAnd more details';
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        multiLineProblem,
        {}
      );

      expect(report).toContain('# Debate: Design a caching system');
      expect(report).toContain('```text\nDesign a caching system\n\nWith multiple lines\nAnd more details\n```');
    });

    it('should handle problem description with leading whitespace', () => {
      const problemWithWhitespace = '\n\n  Design a caching system\n\n';
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        problemWithWhitespace,
        {}
      );

      expect(report).toContain('# Debate: Design a caching system');
    });

    it('should handle empty problem description', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        '',
        {}
      );

      expect(report).toContain('# Debate:');
    });

    it('should format agents table with all fields', () => {
      const debateState = createDebateState();
      const agentConfigs = [
        createAgentConfig({
          id: 'agent-1',
          name: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          model: 'gpt-4',
          provider: LLM_PROVIDERS.OPENAI,
          temperature: 0.7,
          enabled: true,
          systemPromptPath: '/path/to/prompt.md',
          summaryPromptPath: '/path/to/summary.md',
          summarization: {
            enabled: true,
            threshold: 1000,
            maxLength: 500,
            method: 'length-based',
          },
        }),
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| ID | Name | Role | Model | Provider | Temperature | Enabled | SystemPromptPath | SummaryPromptPath | Summarization |');
      expect(report).toContain('| agent-1 | Agent One | architect | gpt-4 | openai | 0.7 | true | /path/to/prompt.md | /path/to/summary.md |');
    });

    it('should format agents table with missing optional fields', () => {
      const debateState = createDebateState();
      const agentConfigs = [
        createAgentConfig({
          id: 'agent-1',
          name: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          model: 'gpt-4',
          provider: LLM_PROVIDERS.OPENAI,
          temperature: 0.7,
        }),
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| agent-1 | Agent One | architect | gpt-4 | openai | 0.7 | N/A | N/A | N/A | N/A |');
    });

    it('should handle empty agents array', () => {
      const debateState = createDebateState();
      const agentConfigs: AgentConfig[] = [];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('No agents configured.');
    });

    it('should format judge table with all fields', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig({
        id: 'judge-1',
        name: 'Judge One',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: 0.3,
        enabled: true,
        systemPromptPath: '/path/to/judge-prompt.md',
        summaryPromptPath: '/path/to/judge-summary.md',
        summarization: {
          enabled: false,
          threshold: 2000,
          maxLength: 1000,
          method: 'length-based',
        },
      });

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| judge-1 | Judge One | generalist | gpt-4 | openai | 0.3 |');
    });

    it('should format judge table with missing optional fields', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig({
        id: 'judge-1',
        name: 'Judge One',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: 0.3,
      });

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| judge-1 | Judge One | generalist | gpt-4 | openai | 0.3 | N/A |');
    });

    it('should handle judge with enabled property set to false', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig({
        enabled: false,
      });

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| judge-1 | Test Judge | generalist | gpt-4 | openai | 0.3 | false |');
    });

    it('should include clarifications section when present', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          items: [
            {
              id: 'q1',
              question: 'What is the expected load?',
              answer: '1000 requests per second',
            },
            {
              id: 'q2',
              question: 'What is the cache size?',
              answer: 'NA',
            },
          ],
        },
      ];

      const debateState = createDebateState({
        clarifications,
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('## Clarifications');
      expect(report).toContain('### Agent One (architect)');
      expect(report).toContain('Question (q1):');
      expect(report).toContain('What is the expected load?');
      expect(report).toContain('Answer:');
      expect(report).toContain('1000 requests per second');
      expect(report).toContain('Question (q2):');
      expect(report).toContain('What is the cache size?');
      expect(report).toContain('NA');
    });

    it('should not include clarifications section when absent', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).not.toContain('## Clarifications');
    });

    it('should handle multiple clarification groups', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          items: [
            {
              id: 'q1',
              question: 'Question 1',
              answer: 'Answer 1',
            },
          ],
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent Two',
          role: AGENT_ROLES.SECURITY,
          items: [
            {
              id: 'q2',
              question: 'Question 2',
              answer: 'Answer 2',
            },
          ],
        },
      ];

      const debateState = createDebateState({
        clarifications,
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('### Agent One (architect)');
      expect(report).toContain('### Agent Two (security)');
    });

    it('should format rounds with proposals', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content here',
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('### Round 1');
      expect(report).toContain('#### Proposals');
      expect(report).toContain('Agent *agent-1*:');
      expect(report).toContain('Proposal content here');
    });

    it('should format rounds with critiques', () => {
      const critique = createContribution(CONTRIBUTION_TYPES.CRITIQUE, {
        agentId: 'agent-1',
        targetAgentId: 'agent-2',
        content: 'Critique content here',
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [critique])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('#### Critiques');
      expect(report).toContain('*agent-1* &rarr; *agent-2*:');
      expect(report).toContain('Critique content here');
    });

    it('should format critiques with missing targetAgentId', () => {
      const critique = createContribution(CONTRIBUTION_TYPES.CRITIQUE, {
        agentId: 'agent-1',
        content: 'Critique content here',
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [critique])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('*agent-1* &rarr; *unknown*:');
    });

    it('should format rounds with refinements', () => {
      const refinement = createContribution(CONTRIBUTION_TYPES.REFINEMENT, {
        agentId: 'agent-1',
        content: 'Refinement content here',
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [refinement])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('#### Refinements');
      expect(report).toContain('Agent *agent-1*:');
      expect(report).toContain('Refinement content here');
    });

    it('should handle rounds with no proposals', () => {
      const debateState = createDebateState({
        rounds: [createDebateRound(1, [])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('#### Proposals');
      expect(report).toContain('No proposals in this round.');
    });

    it('should handle rounds with no critiques', () => {
      const debateState = createDebateState({
        rounds: [createDebateRound(1, [])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('#### Critiques');
      expect(report).toContain('No critiques in this round.');
    });

    it('should handle rounds with no refinements', () => {
      const debateState = createDebateState({
        rounds: [createDebateRound(1, [])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('#### Refinements');
      expect(report).toContain('No refinements in this round.');
    });

    it('should format multiple rounds', () => {
      const round1 = createDebateRound(1, [
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-1',
          content: 'Round 1 proposal',
        }),
      ]);
      const round2 = createDebateRound(2, [
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-1',
          content: 'Round 2 proposal',
        }),
      ]);

      const debateState = createDebateState({
        rounds: [round1, round2],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('### Round 1');
      expect(report).toContain('Round 1 proposal');
      expect(report).toContain('### Round 2');
      expect(report).toContain('Round 2 proposal');
    });

    it('should include metadata in verbose mode', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {
          latencyMs: 150,
          tokensUsed: 200,
        },
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: true }
      );

      expect(report).toContain('Agent *agent-1* (latency=150ms, tokens=200):');
    });

    it('should not include metadata in non-verbose mode', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {
          latencyMs: 150,
          tokensUsed: 200,
        },
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: false }
      );

      expect(report).toContain('Agent *agent-1*:');
      expect(report).not.toContain('latency=');
      expect(report).not.toContain('tokens=');
    });

    it('should handle metadata with missing latency', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {
          tokensUsed: 200,
        },
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: true }
      );

      expect(report).toContain('Agent *agent-1* (latency=N/Ams, tokens=200):');
    });

    it('should handle metadata with missing tokens', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {
          latencyMs: 150,
        },
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: true }
      );

      expect(report).toContain('Agent *agent-1* (latency=150ms, tokens=N/A):');
    });

    it('should handle metadata with both missing', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {},
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: true }
      );

      expect(report).toContain('Agent *agent-1* (latency=N/Ams, tokens=N/A):');
    });

    it('should include final solution when present', () => {
      const solution: Solution = {
        description: 'Final solution description',
        implementation: 'Implementation details',
        tradeoffs: ['Tradeoff 1', 'Tradeoff 2'],
        recommendations: ['Recommendation 1'],
        confidence: 85,
        synthesizedBy: 'judge-1',
      };

      const debateState = createDebateState({
        finalSolution: solution,
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('### Final Synthesis');
      expect(report).toContain('Final solution description');
    });

    it('should handle missing final solution', () => {
      const debateState = createDebateState();
      // Omit finalSolution to test missing case
      delete debateState.finalSolution;
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('### Final Synthesis');
      expect(report).toContain('No final solution available.');
    });

    it('should handle round with mixed contribution types', () => {
      const contributions = [
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-1',
          content: 'Proposal 1',
        }),
        createContribution(CONTRIBUTION_TYPES.CRITIQUE, {
          agentId: 'agent-2',
          targetAgentId: 'agent-1',
          content: 'Critique 1',
        }),
        createContribution(CONTRIBUTION_TYPES.REFINEMENT, {
          agentId: 'agent-1',
          content: 'Refinement 1',
        }),
      ];

      const debateState = createDebateState({
        rounds: [createDebateRound(1, contributions)],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('Proposal 1');
      expect(report).toContain('Critique 1');
      expect(report).toContain('Refinement 1');
    });

    it('should handle multiple agents in proposals', () => {
      const contributions = [
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-1',
          content: 'Proposal from agent 1',
        }),
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-2',
          agentRole: AGENT_ROLES.SECURITY,
          content: 'Proposal from agent 2',
        }),
      ];

      const debateState = createDebateState({
        rounds: [createDebateRound(1, contributions)],
      });
      const agentConfigs = [
        createAgentConfig({ id: 'agent-1' }),
        createAgentConfig({ id: 'agent-2', role: AGENT_ROLES.SECURITY }),
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('Agent *agent-1*:');
      expect(report).toContain('Proposal from agent 1');
      expect(report).toContain('Agent *agent-2*:');
      expect(report).toContain('Proposal from agent 2');
    });

    it('should handle verbose mode defaulting to false when not specified', () => {
      const proposal = createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
        agentId: 'agent-1',
        content: 'Proposal content',
        metadata: {
          latencyMs: 150,
          tokensUsed: 200,
        },
      });

      const debateState = createDebateState({
        rounds: [createDebateRound(1, [proposal])],
      });
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('Agent *agent-1*:');
      expect(report).not.toContain('latency=');
    });

    it('should handle temperature value of 0', () => {
      const debateState = createDebateState();
      const agentConfigs = [
        createAgentConfig({
          temperature: 0,
        }),
      ];
      const judgeConfig = createJudgeConfig({
        temperature: 0,
      });

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| 0 |');
    });

    it('should handle agent with all optional fields undefined', () => {
      const debateState = createDebateState();
      const agentConfigs = [
        {
          id: 'agent-1',
          name: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          model: 'gpt-4',
          provider: LLM_PROVIDERS.OPENAI,
          temperature: 0.5,
        } as AgentConfig,
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| agent-1 | Agent One | architect | gpt-4 | openai | 0.5 | N/A | N/A | N/A | N/A |');
    });

    it('should handle judge with all optional fields undefined', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      const judgeConfig = {
        id: 'judge-1',
        name: 'Judge One',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: 0.3,
      } as AgentConfig;

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      expect(report).toContain('| judge-1 | Judge One | generalist | gpt-4 | openai | 0.3 | N/A |');
    });

    it('should handle agent with falsy required fields', () => {
      const debateState = createDebateState();
      // Use type assertion to test falsy value branches
      const agentConfigs = [
        {
          id: '',
          name: '',
          role: '' as unknown as AgentRole,
          model: '',
          provider: '' as unknown as typeof LLM_PROVIDERS.OPENAI,
          temperature: 0,
        } as AgentConfig,
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      // Should use N/A for falsy values
      expect(report).toContain('| N/A | N/A | N/A | N/A | N/A | 0 |');
    });

    it('should handle judge with falsy required fields', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      // Use type assertion to test falsy value branches
      const judgeConfig = {
        id: '',
        name: '',
        role: '' as unknown as AgentRole,
        model: '',
        provider: '' as unknown as typeof LLM_PROVIDERS.OPENAI,
        temperature: 0,
      } as AgentConfig;

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      // Should use N/A for falsy values
      expect(report).toContain('| N/A | N/A | N/A | N/A | N/A | 0 |');
    });

    it('should handle agent with undefined temperature', () => {
      const debateState = createDebateState();
      // Use type assertion to test undefined temperature branch
      const agentConfigs = [
        {
          id: 'agent-1',
          name: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          model: 'gpt-4',
          provider: LLM_PROVIDERS.OPENAI,
          temperature: undefined as unknown as number,
        } as AgentConfig,
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      // Should use N/A for undefined temperature
      expect(report).toContain('| agent-1 | Agent One | architect | gpt-4 | openai | N/A |');
    });

    it('should handle judge with undefined temperature', () => {
      const debateState = createDebateState();
      const agentConfigs = [createAgentConfig()];
      // Use type assertion to test undefined temperature branch
      const judgeConfig = {
        id: 'judge-1',
        name: 'Judge One',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: undefined as unknown as number,
      } as AgentConfig;

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        {}
      );

      // Should use N/A for undefined temperature
      expect(report).toContain('| judge-1 | Judge One | generalist | gpt-4 | openai | N/A |');
    });

    it('should format complex multi-round debate with all features', () => {
      const clarifications: AgentClarifications[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          role: AGENT_ROLES.ARCHITECT,
          items: [
            {
              id: 'q1',
              question: 'What is the scale?',
              answer: 'Large scale',
            },
          ],
        },
      ];

      const round1 = createDebateRound(1, [
        createContribution(CONTRIBUTION_TYPES.PROPOSAL, {
          agentId: 'agent-1',
          content: 'Round 1 proposal',
          metadata: { latencyMs: 100, tokensUsed: 150 },
        }),
        createContribution(CONTRIBUTION_TYPES.CRITIQUE, {
          agentId: 'agent-2',
          targetAgentId: 'agent-1',
          content: 'Round 1 critique',
          metadata: { latencyMs: 80, tokensUsed: 120 },
        }),
      ]);

      const round2 = createDebateRound(2, [
        createContribution(CONTRIBUTION_TYPES.REFINEMENT, {
          agentId: 'agent-1',
          content: 'Round 2 refinement',
          metadata: { latencyMs: 90, tokensUsed: 110 },
        }),
      ]);

      const solution: Solution = {
        description: 'Final solution',
        implementation: 'Implementation',
        tradeoffs: ['Tradeoff'],
        recommendations: ['Recommendation'],
        confidence: 90,
        synthesizedBy: 'judge-1',
      };

      const debateState = createDebateState({
        clarifications,
        rounds: [round1, round2],
        finalSolution: solution,
      });

      const agentConfigs = [
        createAgentConfig({ id: 'agent-1' }),
        createAgentConfig({ id: 'agent-2', role: AGENT_ROLES.SECURITY }),
      ];
      const judgeConfig = createJudgeConfig();

      const report = generateDebateReport(
        debateState,
        agentConfigs,
        judgeConfig,
        TEST_PROBLEM_DESCRIPTION,
        { verbose: true }
      );

      // Verify all sections are present
      expect(report).toContain('# Debate: Design a caching system');
      expect(report).toContain('## Clarifications');
      expect(report).toContain('### Round 1');
      expect(report).toContain('### Round 2');
      expect(report).toContain('### Final Synthesis');
      expect(report).toContain('Final solution');

      // Verify verbose metadata
      expect(report).toContain('(latency=100ms, tokens=150)');
      expect(report).toContain('(latency=80ms, tokens=120)');
      expect(report).toContain('(latency=90ms, tokens=110)');
    });
  });
});
