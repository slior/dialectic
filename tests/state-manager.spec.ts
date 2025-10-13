import fs from 'fs';
import path from 'path';
import os from 'os';
import { StateManager } from '../src/core/state-manager';
import { DEBATE_STATUS, DebateSummary, SUMMARIZATION_METHODS } from '../src/types/debate.types';
import { AGENT_ROLES } from '../src/types/agent.types';

describe('StateManager promptSources', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-state-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
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
});

// RED-phase: state manager not implemented yet.

describe('StateManager (file-first persistence)', () => {
  it('creates and persists a new debate on createDebate', async () => {
    const sm = new StateManager();
    const state = await sm.createDebate('Problem');
    expect(state.id).toBeDefined();
  });

  it('beginRound creates a new round and increments currentRound', async () => {
    const sm = new StateManager();
    const state = await sm.createDebate('Problem');
    expect(state.currentRound).toBe(0);
    await sm.beginRound(state.id);
    const loaded = await sm.getDebate(state.id);
    expect(loaded?.currentRound).toBe(1);
    expect(loaded?.rounds.length).toBe(1);
  });

  it('addContribution throws if called before beginRound', async () => {
    const sm = new StateManager();
    const state = await sm.createDebate('Problem');
    await expect(sm.addContribution(state.id, {
      agentId: 'a1',
      agentRole: 'architect' as any,
      type: 'proposal',
      content: 'x',
      metadata: {},
    })).rejects.toThrow(/No active round/);
  });
});

describe('StateManager - addSummary()', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-summary-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
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
        beforeChars: 1000,
        afterChars: 500,
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
        beforeChars: 1000,
        afterChars: 500,
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
        beforeChars: 1000,
        afterChars: 500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    const summary2: DebateSummary = {
      agentId: 'agent-2',
      agentRole: AGENT_ROLES.PERFORMANCE,
      summary: 'Summary 2',
      metadata: {
        beforeChars: 2000,
        afterChars: 1000,
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
        beforeChars: 1500,
        afterChars: 750,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date(),
        latencyMs: 200,
        tokensUsed: 50
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
    expect(parsed.rounds[0].summaries['agent-1'].metadata.tokensUsed).toBe(50);
  });

  it('should throw error if no active round', async () => {
    const sm = new StateManager(tmpDir);
    const state = await sm.createDebate('Test Problem');

    const summary: DebateSummary = {
      agentId: 'agent-1',
      agentRole: AGENT_ROLES.ARCHITECT,
      summary: 'Test summary',
      metadata: {
        beforeChars: 1000,
        afterChars: 500,
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
        beforeChars: 1000,
        afterChars: 500,
        method: SUMMARIZATION_METHODS.LENGTH_BASED,
        timestamp: new Date()
      }
    };

    await expect(sm.addSummary('nonexistent-id', summary)).rejects.toThrow(/not found/);
  });
});
