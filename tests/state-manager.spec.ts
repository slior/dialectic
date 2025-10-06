import fs from 'fs';
import path from 'path';
import os from 'os';
import { StateManager } from '../src/core/state-manager';
import { DEBATE_STATUS } from '../src/types/debate.types';

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
