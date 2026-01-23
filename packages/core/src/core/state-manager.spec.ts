import fs from 'fs';
import path from 'path';

import { AGENT_ROLES } from '../types/agent.types';
import { DEBATE_STATUS, DebateSummary, SUMMARIZATION_METHODS, AgentClarifications, Solution } from '../types/debate.types';
import { createTempDir } from '../utils/test-utils';

import { StateManager } from './state-manager';

// Test constants
const MOCK_TOKENS_USED = 50;
const MOCK_LATENCY_MS = 200;
const BEFORE_CHARS_1000 = 1000;
const AFTER_CHARS_500 = 500;
const BEFORE_CHARS_2000 = 2000;
const AFTER_CHARS_1000 = 1000;
const BEFORE_CHARS_1500 = 1500;
const AFTER_CHARS_750 = 750;

describe('StateManager promptSources', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });
  
  afterEach(() => {
    cleanup();
  });

  it('persists promptSources in debate state file', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    expect(state.status).toBe(DEBATE_STATUS.RUNNING);

    await sm.setPromptSources(state.id, {
      agents: [ { agentId: 'a1', role: 'architect', source: 'built-in' } ],
      judge: { id: 'j1', source: 'file', path: 'C:/abs/path.md' }
    });

    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.promptSources).toBeTruthy();
    expect(parsed.promptSources.agents[0].agentId).toBe('a1');
    expect(parsed.promptSources.judge.path).toContain('path.md');
  });

  it('should delete promptSources when sources is undefined', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    
    // First set promptSources
    await sm.setPromptSources(state.id, {
      agents: [ { agentId: 'a1', role: 'architect', source: 'built-in' } ],
      judge: { id: 'j1', source: 'file', path: 'C:/abs/path.md' }
    });
    
    // Then delete it by setting to undefined
    await sm.setPromptSources(state.id, undefined);
    
    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.promptSources).toBeUndefined();
  });

  it('should throw error if debate not found when setting promptSources', async () => {
    const sm = new StateManager(tmpDir);
    
    await expect(sm.setPromptSources('nonexistent-id', {
      agents: [ { agentId: 'a1', role: 'architect', source: 'built-in' } ],
      judge: { id: 'j1', source: 'file', path: 'C:/abs/path.md' }
    })).rejects.toThrow(/not found/);
  });
});

// RED-phase: state manager not implemented yet.

describe('StateManager (file-first persistence)', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });
  
  afterEach(() => {
    cleanup();
  });

  it('creates and persists a new debate on createDebate', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem');
    expect(state.id).toBeDefined();
    expect(state.status).toBe(DEBATE_STATUS.RUNNING);
    expect(state.currentRound).toBe(0);
    expect(state.rounds).toEqual([]);
  });

  it('creates debate with context parameter', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem', 'Additional context');
    expect(state.context).toBe('Additional context');
  });

  it('creates debate with custom id', async () => {
    const sm = new StateManager(tmpDir);
    const customId = 'custom-debate-id';
    const state = await sm.createDebate('Problem', undefined, customId);
    expect(state.id).toBe(customId);
  });

  it('creates debate without context (undefined)', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem', undefined);
    expect(state.context).toBeUndefined();
  });

  it('beginRound creates a new round and increments currentRound', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem');
    expect(state.currentRound).toBe(0);
    await sm.beginRound(state.id);
    const loaded = await sm.getDebate(state.id);
    expect(loaded).toBeDefined();
    expect(loaded!.currentRound).toBe(1);
    expect(loaded!.rounds.length).toBe(1);
    expect(loaded!.rounds[0]!.roundNumber).toBe(1);
    expect(loaded!.rounds[0]!.contributions).toEqual([]);
  });

  it('beginRound throws error if debate not found', async () => {
    const sm = new StateManager(tmpDir);
    await expect(sm.beginRound('nonexistent-id')).rejects.toThrow(/not found/);
  });

  it('addContribution throws if called before beginRound', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem');
    await expect(sm.addContribution(state.id, {
      agentId: 'a1',
      agentRole: AGENT_ROLES.ARCHITECT,
      type: 'proposal',
      content: 'x',
      metadata: {},
    })).rejects.toThrow(/No active round/);
  });

  it('addContribution throws error if debate not found', async () => {
    const sm = new StateManager(tmpDir);
    await expect(sm.addContribution('nonexistent-id', {
      agentId: 'a1',
      agentRole: AGENT_ROLES.ARCHITECT,
      type: 'proposal',
      content: 'x',
      metadata: {},
    })).rejects.toThrow(/not found/);
  });

  it('addContribution successfully adds contribution to round', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Problem');
    await sm.beginRound(state.id);
    
    const contribution = {
      agentId: 'a1',
      agentRole: AGENT_ROLES.ARCHITECT,
      type: 'proposal' as const,
      content: 'Test proposal',
      metadata: { latencyMs: 100 },
    };
    
    const initialUpdatedAt = state.updatedAt.getTime();
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 20));
    
    await sm.addContribution(state.id, contribution);
    
    const loaded = await sm.getDebate(state.id);
    expect(loaded).toBeDefined();
    expect(loaded!.rounds[0]!.contributions).toHaveLength(1);
    expect(loaded!.rounds[0]!.contributions[0]).toEqual(contribution);
    expect(loaded!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - addSummary()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should add summary to current round', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    await sm.beginRound(state.id);

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary text',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await sm.addSummary(state.id, summary);

    const debate = await sm.getDebate(state.id);
    expect(debate).toBeDefined();
    expect(debate!.rounds.length).toBe(1);
    const round = debate!.rounds[0];
    expect(round).toBeDefined();
    expect(round!.summaries).toBeDefined();
    expect(Object.keys(round!.summaries!).length).toBe(1);
    expect(round!.summaries!['agent-1']).toEqual(summary);
  });

  it('should initialize summaries array if not present', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    await sm.beginRound(state.id);

    // First summary should initialize the array
    const summary1: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'First summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await sm.addSummary(state.id, summary1);

    const debate = await sm.getDebate(state.id);
    const round = debate!.rounds[0];
    expect(round).toBeDefined();
    expect(round!.summaries).toBeDefined();
    expect(round!.summaries!['agent-1']).toBeDefined();
    expect(round!.summaries!['agent-1']!.agentId).toBe('agent-1');
  });

  it('should support multiple summaries per round', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    await sm.beginRound(state.id);

    const summary1: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Summary 1',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    const summary2: DebateSummary = {
      agentId: 'agent-2',
      agentRole: AGENT_ROLES.PERFORMANCE,
      summary: 'Summary 2',
      metadata: {
        beforeChars: BEFORE_CHARS_2000,
        afterChars: AFTER_CHARS_1000,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await sm.addSummary(state.id, summary1);
    await sm.addSummary(state.id, summary2);

    const debate = await sm.getDebate(state.id);
    const round = debate!.rounds[0];
    expect(round).toBeDefined();
    expect(Object.keys(round!.summaries!).length).toBe(2);
    const summaries = round!.summaries;
    if (summaries) {
      expect(summaries['agent-1']).toBeDefined();
      expect(summaries['agent-2']).toBeDefined();
      expect(summaries['agent-1']!.agentId).toBe('agent-1');
      expect(summaries['agent-2']!.agentId).toBe('agent-2');
    }
  });

  it('should persist summaries to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    await sm.beginRound(state.id);

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Persisted summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1500,
        afterChars: AFTER_CHARS_750,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date(),
        latencyMs: MOCK_LATENCY_MS,
        tokensUsed: MOCK_TOKENS_USED
      }
    };

    await sm.addSummary(state.id, summary);

    // Read directly from file to verify persistence
    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.rounds[0].summaries).toBeDefined();
    expect(Object.keys(parsed.rounds[0].summaries).length).toBe(1);
    expect(parsed.rounds[0].summaries['agent-1']).toBeDefined();
    expect(parsed.rounds[0].summaries['agent-1'].summary).toBe('Persisted summary');
    expect(parsed.rounds[0].summaries['agent-1'].metadata.latencyMs).toBe(200);
    expect(parsed.rounds[0].summaries['agent-1'].metadata.tokensUsed).toBe(MOCK_TOKENS_USED);
  });

  it('should throw error if no active round', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await expect(sm.addSummary(state.id, summary)).rejects.toThrow(/No active round/);
  });

  it('should throw error if debate not found', async () => {
    const sm = new StateManager(tmpDir);

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await expect(sm.addSummary('nonexistent-id', summary)).rejects.toThrow(/not found/);
  });
});

describe('StateManager updateUserFeedback', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });
  
  afterEach(() => {
    cleanup();
  });

  it('should update userFeedback for existing debate', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    
    await sm.updateUserFeedback(state.id, 1);
    
    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.userFeedback).toBe(1);
    
    // Verify file on disk contains updated userFeedback
    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.userFeedback).toBe(1);
  });

  it('should update userFeedback to negative value', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    
    await sm.updateUserFeedback(state.id, -1);
    
    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.userFeedback).toBe(-1);
  });

  it('should throw error if debate not found', async () => {
    const sm = new StateManager(tmpDir);
    
    await expect(sm.updateUserFeedback('nonexistent-id', 1)).rejects.toThrow(/not found/);
  });

  it('should persist userFeedback to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    await sm.updateUserFeedback(state.id, 1);
    
    // Create new StateManager instance pointing to same directory
    const sm2 = new StateManager(tmpDir);
    const loadedState = await sm2.getDebate(state.id);
    
    expect(loadedState).toBeDefined();
    expect(loadedState!.userFeedback).toBe(1);
  });

  it('should overwrite existing userFeedback', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    
    await sm.updateUserFeedback(state.id, 1);
    await sm.updateUserFeedback(state.id, -1);
    
    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.userFeedback).toBe(-1);
  });

  it('should update updatedAt timestamp', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    const initialUpdatedAt = state.updatedAt.getTime();
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await sm.updateUserFeedback(state.id, 1);
    
    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - addJudgeSummary()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should add judge summary to debate state', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const summary: DebateSummary = {
      agentId: 'judge-1',
      agentRole: 'generalist',
      summary: 'Judge summary text',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await sm.addJudgeSummary(state.id, summary);

    const debate = await sm.getDebate(state.id);
    expect(debate).toBeDefined();
    expect(debate!.judgeSummary).toBeDefined();
    expect(debate!.judgeSummary).toEqual(summary);
  });

  it('should persist judge summary to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const summary: DebateSummary = {
      agentId: 'judge-1',
      agentRole: 'generalist',
      summary: 'Persisted judge summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1500,
        afterChars: AFTER_CHARS_750,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date(),
        latencyMs: MOCK_LATENCY_MS,
        tokensUsed: MOCK_TOKENS_USED
      }
    };

    await sm.addJudgeSummary(state.id, summary);

    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.judgeSummary).toBeDefined();
    expect(parsed.judgeSummary.summary).toBe('Persisted judge summary');
    expect(parsed.judgeSummary.metadata.latencyMs).toBe(MOCK_LATENCY_MS);
    expect(parsed.judgeSummary.metadata.tokensUsed).toBe(MOCK_TOKENS_USED);
  });

  it('should throw error if debate not found', async () => {
    const sm = new StateManager(tmpDir);

    const summary: DebateSummary = {
      agentId: 'judge-1',
      agentRole: 'generalist',
      summary: 'Test summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await expect(sm.addJudgeSummary('nonexistent-id', summary)).rejects.toThrow(/not found/);
  });

  it('should update updatedAt timestamp', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    const initialUpdatedAt = state.updatedAt.getTime();

    await new Promise(resolve => setTimeout(resolve, 10));

    const summary: DebateSummary = {
      agentId: 'judge-1',
      agentRole: 'generalist',
      summary: 'Test summary',
      metadata: {
        beforeChars: BEFORE_CHARS_1000,
        afterChars: AFTER_CHARS_500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await sm.addJudgeSummary(state.id, summary);

    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - setClarifications()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should set clarifications for debate', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const clarifications: AgentClarifications[] = [
      {
        agentId: 'agent-1',
        agentName: 'Architect Agent',
        role: AGENT_ROLES.ARCHITECT,
        items: [
          { id: 'q1', question: 'Q1', answer: 'A1' },
          { id: 'q2', question: 'Q2', answer: 'A2' }
        ]
      }
    ];

    await sm.setClarifications(state.id, clarifications);

    const debate = await sm.getDebate(state.id);
    expect(debate).toBeDefined();
    expect(debate!.clarifications).toBeDefined();
    expect(debate!.clarifications).toEqual(clarifications);
  });

  it('should persist clarifications to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const clarifications: AgentClarifications[] = [
      {
        agentId: 'agent-1',
        agentName: 'Architect Agent',
        role: AGENT_ROLES.ARCHITECT,
        items: [
          { id: 'q1', question: 'What is the scale?', answer: '1000 users' }
        ]
      }
    ];

    await sm.setClarifications(state.id, clarifications);

    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.clarifications).toBeDefined();
    expect(parsed.clarifications).toHaveLength(1);
    expect(parsed.clarifications[0].agentId).toBe('agent-1');
  });

  it('should throw error if debate not found', async () => {
    const sm = new StateManager(tmpDir);

    const clarifications: AgentClarifications[] = [
      {
        agentId: 'agent-1',
        agentName: 'Architect Agent',
        role: AGENT_ROLES.ARCHITECT,
        items: []
      }
    ];

    await expect(sm.setClarifications('nonexistent-id', clarifications)).rejects.toThrow(/not found/);
  });

  it('should update updatedAt timestamp', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    const initialUpdatedAt = state.updatedAt.getTime();

    await new Promise(resolve => setTimeout(resolve, 10));

    const clarifications: AgentClarifications[] = [
      {
        agentId: 'agent-1',
        agentName: 'Architect Agent',
        role: AGENT_ROLES.ARCHITECT,
        items: []
      }
    ];

    await sm.setClarifications(state.id, clarifications);

    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - completeDebate()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should mark debate as completed with solution', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const solution: Solution = {
      description: 'Final solution',
      tradeoffs: ['Tradeoff 1'],
      recommendations: ['Recommendation 1'],
      confidence: 85,
      synthesizedBy: 'judge-1'
    };

    await sm.completeDebate(state.id, solution);

    const debate = await sm.getDebate(state.id);
    expect(debate).toBeDefined();
    expect(debate!.status).toBe(DEBATE_STATUS.COMPLETED);
    expect(debate!.finalSolution).toBeDefined();
    expect(debate!.finalSolution).toEqual(solution);
  });

  it('should persist completed debate to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const solution: Solution = {
      description: 'Final solution',
      tradeoffs: [],
      recommendations: [],
      confidence: 90,
      synthesizedBy: 'judge-1'
    };

    await sm.completeDebate(state.id, solution);

    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.status).toBe(DEBATE_STATUS.COMPLETED);
    expect(parsed.finalSolution).toBeDefined();
    expect(parsed.finalSolution.description).toBe('Final solution');
  });

  it('should throw error if debate not found', async () => {
    const sm = new StateManager(tmpDir);

    const solution: Solution = {
      description: 'Final solution',
      tradeoffs: [],
      recommendations: [],
      confidence: 80,
      synthesizedBy: 'judge-1'
    };

    await expect(sm.completeDebate('nonexistent-id', solution)).rejects.toThrow(/not found/);
  });

  it('should update updatedAt timestamp', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    const initialUpdatedAt = state.updatedAt.getTime();

    await new Promise(resolve => setTimeout(resolve, 10));

    const solution: Solution = {
      description: 'Final solution',
      tradeoffs: [],
      recommendations: [],
      confidence: 85,
      synthesizedBy: 'judge-1'
    };

    await sm.completeDebate(state.id, solution);

    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - failDebate()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should mark debate as failed', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const error = new Error('Test error');
    await sm.failDebate(state.id, error);

    const debate = await sm.getDebate(state.id);
    expect(debate).toBeDefined();
    expect(debate!.status).toBe(DEBATE_STATUS.FAILED);
  });

  it('should persist failed debate to disk', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const error = new Error('Test error');
    await sm.failDebate(state.id, error);

    const filePath = path.join(tmpDir, `${state.id}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.status).toBe(DEBATE_STATUS.FAILED);
  });

  it('should not throw error if debate not found (returns early)', async () => {
    const sm = new StateManager(tmpDir);

    const error = new Error('Test error');
    await expect(sm.failDebate('nonexistent-id', error)).resolves.not.toThrow();
  });

  it('should update updatedAt timestamp', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    const initialUpdatedAt = state.updatedAt.getTime();

    await new Promise(resolve => setTimeout(resolve, 10));

    const error = new Error('Test error');
    await sm.failDebate(state.id, error);

    const loadedState = await sm.getDebate(state.id);
    expect(loadedState).toBeDefined();
    expect(loadedState!.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
  });
});

describe('StateManager - getDebate()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should return debate from in-memory cache', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const retrieved = await sm.getDebate(state.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(state.id);
    expect(retrieved!.problem).toBe('Test Problem');
  });

  it('should load debate from disk when not in memory', async () => {
    const sm1 = new StateManager(tmpDir);
    const state = await sm1.createDebate('Test Problem');
    const debateId = state.id;

    // Create new StateManager instance (new in-memory cache)
    const sm2 = new StateManager(tmpDir);
    const retrieved = await sm2.getDebate(debateId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(debateId);
    expect(retrieved!.problem).toBe('Test Problem');
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
    expect(retrieved!.updatedAt).toBeInstanceOf(Date);
  });

  it('should return null when debate file does not exist', async () => {
    const sm = new StateManager(tmpDir);
    const retrieved = await sm.getDebate('nonexistent-id');
    expect(retrieved).toBeNull();
  });

  it('should revive date fields when loading from disk', async () => {
    const sm1 = new StateManager(tmpDir);
    const state = await sm1.createDebate('Test Problem');
    const debateId = state.id;

    // Manually write to file to simulate disk storage
    const filePath = path.join(tmpDir, `${debateId}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(typeof parsed.createdAt).toBe('string');
    expect(typeof parsed.updatedAt).toBe('string');

    // Load through StateManager
    const sm2 = new StateManager(tmpDir);
    const retrieved = await sm2.getDebate(debateId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
    expect(retrieved!.updatedAt).toBeInstanceOf(Date);
  });
});

describe('StateManager - listDebates()', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should return empty array when directory does not exist', async () => {
    const nonExistentDir = path.join(tmpDir, 'nonexistent');
    const sm = new StateManager(nonExistentDir);
    // Constructor creates the directory, so delete it to test the false branch
    fs.rmSync(nonExistentDir, { recursive: true, force: true });
    const debates = await sm.listDebates();
    expect(debates).toEqual([]);
  });

  it('should return empty array when directory is empty', async () => {
    const sm = new StateManager(tmpDir);
    const debates = await sm.listDebates();
    expect(debates).toEqual([]);
  });

  it('should list all debates sorted by most recent first', async () => {
    const sm = new StateManager(tmpDir);
    
    // Create debates with delays to ensure different timestamps
    const state1 = await sm.createDebate('Problem 1');
    await new Promise(resolve => setTimeout(resolve, 10));
    const state2 = await sm.createDebate('Problem 2');
    await new Promise(resolve => setTimeout(resolve, 10));
    const state3 = await sm.createDebate('Problem 3');

    const debates = await sm.listDebates();
    expect(debates).toHaveLength(3);
    expect(debates[0]!.id).toBe(state3.id);
    expect(debates[1]!.id).toBe(state2.id);
    expect(debates[2]!.id).toBe(state1.id);
  });

  it('should skip non-JSON files in directory', async () => {
    const sm = new StateManager(tmpDir);
    await sm.createDebate('Problem 1');
    
    // Create a non-JSON file
    const textFilePath = path.join(tmpDir, 'not-a-debate.txt');
    fs.writeFileSync(textFilePath, 'not a debate');

    const debates = await sm.listDebates();
    expect(debates).toHaveLength(1);
  });

  it('should throw error when encountering invalid JSON files', async () => {
    const sm = new StateManager(tmpDir);
    await sm.createDebate('Problem 1');
    
    // Create an invalid JSON file
    const invalidJsonPath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(invalidJsonPath, '{ invalid json }');

    // getDebate throws when JSON.parse fails, so listDebates will also throw
    await expect(sm.listDebates()).rejects.toThrow();
  });

  it('should load debates from disk when listing', async () => {
    const sm1 = new StateManager(tmpDir);
    const state = await sm1.createDebate('Problem 1');

    // Create new StateManager instance
    const sm2 = new StateManager(tmpDir);
    const debates = await sm2.listDebates();

    expect(debates).toHaveLength(1);
    expect(debates[0]!).toBeDefined();
    expect(debates[0]!.id).toBe(state.id);
    expect(debates[0]!.problem).toBe('Problem 1');
  });
});

describe('StateManager - constructor and directory management', () => {
  let tmpDir: string;
  let cleanup: () => void;
  
  beforeEach(() => {
    const temp = createTempDir('debate-state-');
    tmpDir = temp.tmpDir;
    cleanup = temp.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should create directory if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'new-debates-dir');
    expect(fs.existsSync(newDir)).toBe(false);

    const sm = new StateManager(newDir);
    expect(fs.existsSync(newDir)).toBe(true);

    // Should be able to create a debate
    const state = await sm.createDebate('Test Problem');
    expect(state).toBeDefined();
  });

  it('should use existing directory if it already exists', async () => {
    // Directory already exists from beforeEach
    expect(fs.existsSync(tmpDir)).toBe(true);

    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');
    expect(state).toBeDefined();
  });

  it('should use default directory when none specified', () => {
    const sm = new StateManager();
    expect(sm).toBeDefined();
    // Default directory should be resolved from process.cwd()
  });
});

