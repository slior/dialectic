import { StateManager } from '../src/core/state-manager';
import { DebateState } from '../src/types/debate.types';

// RED-phase: state manager not implemented yet.

describe('StateManager (file-first persistence)', () => {
  it('creates and persists a new debate on createDebate', async () => {
    const sm = new StateManager();
    const state: DebateState = await sm.createDebate('Problem');
    expect(state.id).toBeDefined();
  });
});
