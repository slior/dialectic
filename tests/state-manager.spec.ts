import { StateManager } from '../src/core/state-manager';
import { DebateState } from '../src/types/debate.types';

// RED-phase: state manager not implemented yet.

describe('StateManager (file-first persistence)', () => {
  it('creates and persists a new debate on createDebate', async () => {
    const sm = new StateManager();
    const state: DebateState = await sm.createDebate('Problem');
    expect(state.id).toBeDefined();
  });

  it('beginRound creates a new round and increments currentRound', async () => {
    const sm = new StateManager();
    const state: DebateState = await sm.createDebate('Problem');
    expect(state.currentRound).toBe(0);
    await sm.beginRound(state.id);
    const loaded = await sm.getDebate(state.id);
    expect(loaded?.currentRound).toBe(1);
    expect(loaded?.rounds.length).toBe(1);
  });

  it('addContribution throws if called before beginRound', async () => {
    const sm = new StateManager();
    const state: DebateState = await sm.createDebate('Problem');
    await expect(sm.addContribution(state.id, {
      agentId: 'a1',
      agentRole: 'architect' as any,
      type: 'proposal',
      content: 'x',
      metadata: {},
    })).rejects.toThrow(/No active round/);
  });
});
