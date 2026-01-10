import { AgentConfig, AGENT_ROLES } from '../types/agent.types';
import { ClarificationQuestionsResponse } from '../types/debate.types';

import { Agent } from './agent';
import { collectClarifications } from './clarifications';

describe('collectClarifications', () => {
  const TEST_PROBLEM = 'Design a rate limiting system';
  const MAX_PER_AGENT = 5;

  /**
   * Creates a mock agent with configurable askClarifyingQuestions behavior.
   */
  function createMockAgent(
    id: string,
    name: string,
    role: string,
    questionsResponse: ClarificationQuestionsResponse
  ): Agent {
    return {
      config: {
        id,
        name,
        role: role as any,
        model: 'gpt-4',
        provider: 'openai' as any,
        temperature: 0.5,
      } as AgentConfig,
      askClarifyingQuestions: jest.fn().mockResolvedValue(questionsResponse),
    } as unknown as Agent;
  }

  /**
   * Creates a mock warning function that tracks calls.
   */
  function createMockWarn(): jest.Mock<void, [string]> {
    return jest.fn<void, [string]>();
  }

  describe('basic functionality', () => {
    it('should collect questions from a single agent', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'What is the expected request rate?' },
          { id: 'q2', text: 'What is the time window?' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Architect',
        role: AGENT_ROLES.ARCHITECT,
        items: [
          { id: 'q1', question: 'What is the expected request rate?', answer: '' },
          { id: 'q2', question: 'What is the time window?', answer: '' },
        ],
      });
      expect(agent.askClarifyingQuestions).toHaveBeenCalledWith(TEST_PROBLEM, { problem: TEST_PROBLEM });
      expect(warn).not.toHaveBeenCalled();
    });

    it('should collect questions from multiple agents', async () => {
      const agent1Questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'What is the expected request rate?' },
        ],
      };
      const agent2Questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'What security requirements are needed?' },
          { id: 'q2', text: 'What authentication method?' },
        ],
      };
      const agent1 = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, agent1Questions);
      const agent2 = createMockAgent('agent-2', 'Security', AGENT_ROLES.SECURITY, agent2Questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent1, agent2], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Architect',
        role: AGENT_ROLES.ARCHITECT,
        items: [
          { id: 'q1', question: 'What is the expected request rate?', answer: '' },
        ],
      });
      expect(result[1]).toEqual({
        agentId: 'agent-2',
        agentName: 'Security',
        role: AGENT_ROLES.SECURITY,
        items: [
          { id: 'q1', question: 'What security requirements are needed?', answer: '' },
          { id: 'q2', question: 'What authentication method?', answer: '' },
        ],
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle questions without IDs by using the question index', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { text: 'First question without ID' },
          { text: 'Second question without ID' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(2);
      expect(result[0]!.items[0]!.id).toBeUndefined();
      expect(result[0]!.items[0]!.question).toBe('First question without ID');
      expect(result[0]!.items[1]!.id).toBeUndefined();
      expect(result[0]!.items[1]!.question).toBe('Second question without ID');
    });

    it('should handle mixed questions with and without IDs', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question with ID' },
          { text: 'Question without ID' },
          { id: 'q3', text: 'Another question with ID' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(3);
      expect(result[0]!.items[0]!.id).toBe('q1');
      expect(result[0]!.items[1]!.id).toBeUndefined();
      expect(result[0]!.items[2]!.id).toBe('q3');
    });
  });

  describe('edge cases', () => {
    it('should handle empty questions array', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle null response', async () => {
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, null as any);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle undefined response', async () => {
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, undefined as any);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle response with non-array questions property', async () => {
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, { questions: 'not an array' } as any);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle response with missing questions property', async () => {
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, {} as any);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle empty agents array', async () => {
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [], MAX_PER_AGENT, warn);

      expect(result).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('truncation and limits', () => {
    it('should truncate questions when exceeding maxPerAgent', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
          { id: 'q3', text: 'Question 3' },
          { id: 'q4', text: 'Question 4' },
          { id: 'q5', text: 'Question 5' },
          { id: 'q6', text: 'Question 6' },
          { id: 'q7', text: 'Question 7' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(MAX_PER_AGENT);
      expect(result[0]!.items[0]!.question).toBe('Question 1');
      expect(result[0]!.items[4]!.question).toBe('Question 5');
      expect(result[0]!.items[4]!.id).toBe('q5');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('Agent Architect returned 7 questions; limited to 5.');
    });

    it('should not warn when questions exactly match maxPerAgent', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
          { id: 'q3', text: 'Question 3' },
          { id: 'q4', text: 'Question 4' },
          { id: 'q5', text: 'Question 5' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(MAX_PER_AGENT);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should not warn when questions are below maxPerAgent', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(2);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should handle maxPerAgent of 0', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], 0, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('Agent Architect returned 2 questions; limited to 0.');
    });

    it('should warn each agent separately when multiple agents exceed limit', async () => {
      const agent1Questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
          { id: 'q3', text: 'Question 3' },
          { id: 'q4', text: 'Question 4' },
          { id: 'q5', text: 'Question 5' },
          { id: 'q6', text: 'Question 6' },
        ],
      };
      const agent2Questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
          { id: 'q3', text: 'Question 3' },
          { id: 'q4', text: 'Question 4' },
          { id: 'q5', text: 'Question 5' },
          { id: 'q6', text: 'Question 6' },
          { id: 'q7', text: 'Question 7' },
        ],
      };
      const agent1 = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, agent1Questions);
      const agent2 = createMockAgent('agent-2', 'Security', AGENT_ROLES.SECURITY, agent2Questions);
      const warn = createMockWarn();

      await collectClarifications(TEST_PROBLEM, [agent1, agent2], MAX_PER_AGENT, warn);

      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, 'Agent Architect returned 6 questions; limited to 5.');
      expect(warn).toHaveBeenNthCalledWith(2, 'Agent Security returned 7 questions; limited to 5.');
    });
  });

  describe('agent metadata mapping', () => {
    it('should correctly map agent ID, name, and role', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
        ],
      };
      const agent = createMockAgent('custom-agent-id', 'Custom Agent Name', AGENT_ROLES.PERFORMANCE, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.agentId).toBe('custom-agent-id');
      expect(result[0]!.agentName).toBe('Custom Agent Name');
      expect(result[0]!.role).toBe(AGENT_ROLES.PERFORMANCE);
    });

    it('should handle all agent roles correctly', async () => {
      const roles = [
        AGENT_ROLES.ARCHITECT,
        AGENT_ROLES.SECURITY,
        AGENT_ROLES.PERFORMANCE,
        AGENT_ROLES.TESTING,
        AGENT_ROLES.GENERALIST,
        AGENT_ROLES.KISS,
        AGENT_ROLES.DATA_MODELING,
      ];
      const questions: ClarificationQuestionsResponse = {
        questions: [{ id: 'q1', text: 'Question' }],
      };
      const warn = createMockWarn();

      const agents = roles.map((role, idx) =>
        createMockAgent(`agent-${idx}`, `Agent ${idx}`, role, questions)
      );

      const result = await collectClarifications(TEST_PROBLEM, agents, MAX_PER_AGENT, warn);

      expect(result).toHaveLength(roles.length);
      result.forEach((clarification, idx) => {
        expect(clarification.role).toBe(roles[idx]);
      });
    });
  });

  describe('answer initialization', () => {
    it('should initialize all answers as empty strings', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [
          { id: 'q1', text: 'Question 1' },
          { id: 'q2', text: 'Question 2' },
          { id: 'q3', text: 'Question 3' },
        ],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, [agent], MAX_PER_AGENT, warn);

      expect(result[0]).toBeDefined();
      expect(result[0]!.items).toHaveLength(3);
      result[0]!.items.forEach((item) => {
        expect(item.answer).toBe('');
      });
    });
  });

  describe('concurrent execution', () => {
    it('should handle concurrent agent calls correctly', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [{ id: 'q1', text: 'Question' }],
      };
      const agents = [
        createMockAgent('agent-1', 'Agent 1', AGENT_ROLES.ARCHITECT, questions),
        createMockAgent('agent-2', 'Agent 2', AGENT_ROLES.SECURITY, questions),
        createMockAgent('agent-3', 'Agent 3', AGENT_ROLES.PERFORMANCE, questions),
      ];
      const warn = createMockWarn();

      const result = await collectClarifications(TEST_PROBLEM, agents, MAX_PER_AGENT, warn);

      expect(result).toHaveLength(3);
      agents.forEach((agent) => {
        expect(agent.askClarifyingQuestions).toHaveBeenCalled();
      });
    });
  });

  describe('context passing', () => {
    it('should pass correct context to askClarifyingQuestions', async () => {
      const questions: ClarificationQuestionsResponse = {
        questions: [{ id: 'q1', text: 'Question' }],
      };
      const agent = createMockAgent('agent-1', 'Architect', AGENT_ROLES.ARCHITECT, questions);
      const warn = createMockWarn();
      const problem = 'Design a distributed cache';

      await collectClarifications(problem, [agent], MAX_PER_AGENT, warn);

      expect(agent.askClarifyingQuestions).toHaveBeenCalledWith(problem, { problem });
    });
  });
});
