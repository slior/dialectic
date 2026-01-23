import { createMockDebateContext, createMockDebateContextWithFullHistory, createMockDebateContextWithSummary, createMockDebateContextWithClarifications } from './test-utils';

describe('test-utils', () => {
  describe('createMockDebateContext', () => {
    it('should create context with provided problem', () => {
      const problem = 'Test problem';
      const context = createMockDebateContext(problem);

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.history).toEqual([]);
    });

    it('should create context with empty problem when no argument provided', () => {
      const context = createMockDebateContext();

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toEqual([]);
    });

    it('should create context with empty string when empty string provided', () => {
      const context = createMockDebateContext('');

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toEqual([]);
    });

    it('should return consistent results for same input', () => {
      const problem = 'Consistent test problem';
      const context1 = createMockDebateContext(problem);
      const context2 = createMockDebateContext(problem);

      expect(context1.problem).toBe(context2.problem);
      expect(context1.history).toEqual(context2.history);
    });

    it('should return different contexts for different problems', () => {
      const context1 = createMockDebateContext('Problem 1');
      const context2 = createMockDebateContext('Problem 2');

      expect(context1.problem).not.toBe(context2.problem);
      expect(context1.history).toEqual(context2.history);
    });
  });

  describe('createMockDebateContextWithFullHistory', () => {
    it('should create context with provided problem and full history', () => {
      const problem = 'Test problem';
      const context = createMockDebateContextWithFullHistory(problem);

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      expect(context.history.length).toBe(1);
      expect(context.history[0]?.roundNumber).toBe(1);
      expect(context.history[0]?.contributions.length).toBe(1);
      expect(context.history[0]?.contributions[0]?.agentId).toBe('agent-1');
      expect(context.history[0]?.contributions[0]?.agentRole).toBe('architect');
      expect(context.history[0]?.contributions[0]?.type).toBe('proposal');
      expect(context.history[0]?.contributions[0]?.content).toBe('Previous proposal');
      expect(context.history[0]?.contributions[0]?.metadata).toEqual({});
      expect(context.history[0]?.summaries).toEqual({});
      expect(context.history[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should create context with empty problem when no argument provided', () => {
      const context = createMockDebateContextWithFullHistory();

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      expect(context.history.length).toBe(1);
      expect(context.history[0]?.roundNumber).toBe(1);
    });

    it('should create context with empty string when empty string provided', () => {
      const context = createMockDebateContextWithFullHistory('');

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      expect(context.history.length).toBe(1);
    });

    it('should return consistent results for same input', () => {
      const problem = 'Consistent test problem';
      const context1 = createMockDebateContextWithFullHistory(problem);
      const context2 = createMockDebateContextWithFullHistory(problem);

      expect(context1.problem).toBe(context2.problem);
      expect(context1.history).toBeDefined();
      expect(context2.history).toBeDefined();
      if (!context1.history || !context2.history) return;
      expect(context1.history.length).toBe(context2.history.length);
      expect(context1.history[0]?.roundNumber).toBe(context2.history[0]?.roundNumber);
    });

    it('should return different contexts for different problems', () => {
      const context1 = createMockDebateContextWithFullHistory('Problem 1');
      const context2 = createMockDebateContextWithFullHistory('Problem 2');

      expect(context1.problem).not.toBe(context2.problem);
      expect(context1.history).toBeDefined();
      expect(context2.history).toBeDefined();
      if (!context1.history || !context2.history) return;
      expect(context1.history.length).toBe(context2.history.length);
    });

    it('should create history with correct structure', () => {
      const context = createMockDebateContextWithFullHistory('Test');

      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      expect(context.history[0]).toBeDefined();
      expect(context.history[0]?.roundNumber).toBe(1);
      expect(context.history[0]?.contributions).toBeDefined();
      expect(Array.isArray(context.history[0]?.contributions)).toBe(true);
      expect(context.history[0]?.contributions.length).toBe(1);
      expect(context.history[0]?.summaries).toBeDefined();
      expect(typeof context.history[0]?.summaries).toBe('object');
      expect(context.history[0]?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('createMockDebateContextWithSummary', () => {
    it('should create context with provided agentId, agentRole, and problem', () => {
      const agentId = 'agent-test-1';
      const agentRole = 'security';
      const problem = 'Test problem';
      const context = createMockDebateContextWithSummary(agentId, agentRole, problem);

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      expect(context.history.length).toBe(1);
      expect(context.history[0]?.roundNumber).toBe(1);
      expect(context.history[0]?.contributions).toEqual([]);
      expect(context.history[0]?.summaries).toBeDefined();
      const summary = context.history[0]?.summaries?.[agentId];
      expect(summary).toBeDefined();
      if (!summary) return;
      expect(summary.agentId).toBe(agentId);
      expect(summary.agentRole).toBe(agentRole);
      expect(summary.summary).toBe('Previous round summary');
      expect(summary.metadata.beforeChars).toBe(1000);
      expect(summary.metadata.afterChars).toBe(500);
      expect(summary.metadata.method).toBe('length-based');
      expect(summary.metadata.timestamp).toBeInstanceOf(Date);
      expect(context.history[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should create context with default agentRole when not provided', () => {
      const agentId = 'agent-test-1';
      const context = createMockDebateContextWithSummary(agentId);

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      const summary = context.history[0]?.summaries?.[agentId];
      expect(summary).toBeDefined();
      if (!summary) return;
      expect(summary.agentRole).toBe('architect');
    });

    it('should create context with default problem when not provided', () => {
      const agentId = 'agent-test-1';
      const agentRole = 'performance';
      const context = createMockDebateContextWithSummary(agentId, agentRole);

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      const summary = context.history[0]?.summaries?.[agentId];
      expect(summary).toBeDefined();
      if (!summary) return;
      expect(summary.agentRole).toBe(agentRole);
    });

    it('should create context with all defaults when only agentId provided', () => {
      const agentId = 'agent-test-1';
      const context = createMockDebateContextWithSummary(agentId);

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toBeDefined();
      expect(context.history).not.toBeUndefined();
      if (!context.history) return;
      const summary = context.history[0]?.summaries?.[agentId];
      expect(summary).toBeDefined();
      if (!summary) return;
      expect(summary.agentRole).toBe('architect');
    });

    it('should support different agent roles', () => {
      const agentId = 'agent-test-1';
      const problem = 'Test problem';
      const roles: Array<'security' | 'performance' | 'testing' | 'kiss' | 'generalist' | 'datamodeling'> = [
        'security',
        'performance',
        'testing',
        'kiss',
        'generalist',
        'datamodeling',
      ];

      for (const role of roles) {
        const context = createMockDebateContextWithSummary(agentId, role, problem);
        expect(context.history).toBeDefined();
        if (!context.history) continue;
        const summary = context.history[0]?.summaries?.[agentId];
        expect(summary).toBeDefined();
        if (!summary) continue;
        expect(summary.agentRole).toBe(role);
      }
    });

    it('should return consistent results for same inputs', () => {
      const agentId = 'agent-test-1';
      const agentRole = 'security';
      const problem = 'Consistent test problem';
      const context1 = createMockDebateContextWithSummary(agentId, agentRole, problem);
      const context2 = createMockDebateContextWithSummary(agentId, agentRole, problem);

      expect(context1.problem).toBe(context2.problem);
      expect(context1.history).toBeDefined();
      expect(context2.history).toBeDefined();
      if (!context1.history || !context2.history) return;
      expect(context1.history.length).toBe(context2.history.length);
      expect(context1.history[0]?.roundNumber).toBe(context2.history[0]?.roundNumber);
      const summary1 = context1.history[0]?.summaries?.[agentId];
      const summary2 = context2.history[0]?.summaries?.[agentId];
      expect(summary1).toBeDefined();
      expect(summary2).toBeDefined();
      if (!summary1 || !summary2) return;
      expect(summary1.agentRole).toBe(summary2.agentRole);
    });

    it('should return different contexts for different agentIds', () => {
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';
      const agentRole = 'testing';
      const problem = 'Test problem';
      const context1 = createMockDebateContextWithSummary(agentId1, agentRole, problem);
      const context2 = createMockDebateContextWithSummary(agentId2, agentRole, problem);

      expect(context1.problem).toBe(context2.problem);
      expect(context1.history).toBeDefined();
      expect(context2.history).toBeDefined();
      if (!context1.history || !context2.history) return;
      const summary1 = context1.history[0]?.summaries?.[agentId1];
      const summary2 = context2.history[0]?.summaries?.[agentId2];
      expect(summary1).toBeDefined();
      expect(summary2).toBeDefined();
      expect(summary1).not.toBe(summary2);
    });
  });

  describe('createMockDebateContextWithClarifications', () => {
    it('should create context with all parameters provided', () => {
      const agentName = 'Test Agent';
      const role = 'security';
      const question = 'What is the data sensitivity level?';
      const answer = 'Highly sensitive';
      const problem = 'Test problem';
      const agentId = 'agent-test-1';
      const questionId = 'q2';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        agentId,
        questionId
      );

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.history).toEqual([]);
      expect(context.clarifications).toBeDefined();
      expect(context.clarifications?.length).toBe(1);
      expect(context.clarifications?.[0]?.agentId).toBe(agentId);
      expect(context.clarifications?.[0]?.agentName).toBe(agentName);
      expect(context.clarifications?.[0]?.role).toBe(role);
      expect(context.clarifications?.[0]?.items).toBeDefined();
      expect(context.clarifications?.[0]?.items.length).toBe(1);
      expect(context.clarifications?.[0]?.items[0]?.id).toBe(questionId);
      expect(context.clarifications?.[0]?.items[0]?.question).toBe(question);
      expect(context.clarifications?.[0]?.items[0]?.answer).toBe(answer);
    });

    it('should create context with default problem when not provided', () => {
      const agentName = 'Test Agent';
      const role = 'performance';
      const question = 'What is the expected request rate?';
      const answer = '10K requests/sec';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer
      );

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toEqual([]);
      expect(context.clarifications).toBeDefined();
      expect(context.clarifications?.length).toBe(1);
      expect(context.clarifications?.[0]?.agentName).toBe(agentName);
      expect(context.clarifications?.[0]?.role).toBe(role);
    });

    it('should create context with default agentId when not provided', () => {
      const agentName = 'Test Agent';
      const role = 'testing';
      const question = 'What is the expected test coverage?';
      const answer = '80%';
      const problem = 'Test problem';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem
      );

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.clarifications).toBeDefined();
      expect(context.clarifications?.[0]?.agentId).toBe('agent-1');
    });

    it('should create context with default questionId when not provided', () => {
      const agentName = 'Test Agent';
      const role = 'kiss';
      const question = 'What is the expected user volume?';
      const answer = '10M users';
      const problem = 'Test problem';
      const agentId = 'agent-test-1';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        agentId
      );

      expect(context).toBeDefined();
      expect(context.clarifications).toBeDefined();
      expect(context.clarifications?.[0]?.items[0]?.id).toBe('q1');
    });

    it('should create context with all defaults when only required params provided', () => {
      const agentName = 'Test Agent';
      const role = 'generalist';
      const question = 'What is the expected user volume?';
      const answer = '10M users';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer
      );

      expect(context).toBeDefined();
      expect(context.problem).toBe('');
      expect(context.history).toEqual([]);
      expect(context.clarifications).toBeDefined();
      expect(context.clarifications?.length).toBe(1);
      expect(context.clarifications?.[0]?.agentId).toBe('agent-1');
      expect(context.clarifications?.[0]?.agentName).toBe(agentName);
      expect(context.clarifications?.[0]?.role).toBe(role);
      expect(context.clarifications?.[0]?.items[0]?.id).toBe('q1');
      expect(context.clarifications?.[0]?.items[0]?.question).toBe(question);
      expect(context.clarifications?.[0]?.items[0]?.answer).toBe(answer);
    });

    it('should create context with custom problem and default agentId and questionId', () => {
      const agentName = 'Test Agent';
      const role = 'datamodeling';
      const question = 'What is the expected data volume?';
      const answer = '1M records';
      const problem = 'Custom problem';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem
      );

      expect(context).toBeDefined();
      expect(context.problem).toBe(problem);
      expect(context.clarifications?.[0]?.agentId).toBe('agent-1');
      expect(context.clarifications?.[0]?.items[0]?.id).toBe('q1');
    });

    it('should create context with custom agentId and default questionId', () => {
      const agentName = 'Test Agent';
      const role = 'security';
      const question = 'What is the data sensitivity level?';
      const answer = 'Highly sensitive';
      const problem = 'Test problem';
      const agentId = 'agent-custom-1';
      const context = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        agentId
      );

      expect(context).toBeDefined();
      expect(context.clarifications?.[0]?.agentId).toBe(agentId);
      expect(context.clarifications?.[0]?.items[0]?.id).toBe('q1');
    });

    it('should support different agent roles', () => {
      const agentName = 'Test Agent';
      const question = 'Test question';
      const answer = 'Test answer';
      const roles: Array<'security' | 'performance' | 'testing' | 'kiss' | 'generalist' | 'datamodeling' | 'architect'> = [
        'security',
        'performance',
        'testing',
        'kiss',
        'generalist',
        'datamodeling',
        'architect',
      ];

      for (const role of roles) {
        const context = createMockDebateContextWithClarifications(
          agentName,
          role,
          question,
          answer
        );
        expect(context.clarifications).toBeDefined();
        expect(context.clarifications?.[0]?.role).toBe(role);
      }
    });

    it('should return consistent results for same inputs', () => {
      const agentName = 'Test Agent';
      const role = 'security';
      const question = 'What is the data sensitivity level?';
      const answer = 'Highly sensitive';
      const problem = 'Test problem';
      const agentId = 'agent-test-1';
      const questionId = 'q2';
      const context1 = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        agentId,
        questionId
      );
      const context2 = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        agentId,
        questionId
      );

      expect(context1.problem).toBe(context2.problem);
      expect(context1.history).toEqual(context2.history);
      expect(context1.clarifications?.length).toBe(context2.clarifications?.length);
      if (context1.clarifications && context2.clarifications) {
        expect(context1.clarifications[0]?.agentId).toBe(context2.clarifications[0]?.agentId);
        expect(context1.clarifications[0]?.agentName).toBe(context2.clarifications[0]?.agentName);
        expect(context1.clarifications[0]?.role).toBe(context2.clarifications[0]?.role);
        expect(context1.clarifications[0]?.items[0]?.id).toBe(context2.clarifications[0]?.items[0]?.id);
        expect(context1.clarifications[0]?.items[0]?.question).toBe(context2.clarifications[0]?.items[0]?.question);
        expect(context1.clarifications[0]?.items[0]?.answer).toBe(context2.clarifications[0]?.items[0]?.answer);
      }
    });

    it('should return different contexts for different inputs', () => {
      const agentName = 'Test Agent';
      const role = 'security';
      const question = 'What is the data sensitivity level?';
      const answer = 'Highly sensitive';
      const problem = 'Test problem';
      const context1 = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        'agent-1',
        'q1'
      );
      const context2 = createMockDebateContextWithClarifications(
        agentName,
        role,
        question,
        answer,
        problem,
        'agent-2',
        'q2'
      );

      expect(context1.problem).toBe(context2.problem);
      expect(context1.clarifications?.[0]?.agentId).not.toBe(context2.clarifications?.[0]?.agentId);
      expect(context1.clarifications?.[0]?.items[0]?.id).not.toBe(context2.clarifications?.[0]?.items[0]?.id);
    });
  });
});

