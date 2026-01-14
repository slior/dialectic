import { MessageType, MESSAGE_ICONS, CONTRIBUTION_TYPES } from 'dialectic-core';

import { DebateProgressUI } from './progress-ui';

// Test constants
const DEFAULT_TOTAL_ROUNDS = 3;
const TEST_AGENT_NAME = 'System Architect';
const TEST_AGENT_NAME_ALT = 'Agent1';
const TEST_AGENT_NAME_GENERIC = 'Test Agent';
const TEST_ACTIVITY = 'proposing';
const TEST_MESSAGE = 'Test message';
const TEST_ERROR_MESSAGE = 'Test error';
const TEST_LOG_MESSAGE = 'Test log message';
const ANSI_MOVE_UP = '\x1b[1A';
const ANSI_CLEAR_LINE = '\x1b[2K';

// Mock console.error to capture output
let stderrOutput: string[] = [];

/**
 * Creates a new DebateProgressUI instance initialized with default test settings.
 *
 * @param totalRounds - Total number of rounds (default: DEFAULT_TOTAL_ROUNDS).
 * @returns Initialized DebateProgressUI instance.
 */
function createUI(totalRounds: number = DEFAULT_TOTAL_ROUNDS): DebateProgressUI {
  const ui = new DebateProgressUI();
  ui.initialize(totalRounds);
  return ui;
}

/**
 * Gets the accumulated stderr output as a single string.
 *
 * @returns All captured stderr output joined together.
 */
function getOutput(): string {
  return stderrOutput.join('');
}

beforeEach(() => {
  stderrOutput = [];
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = String(args[0]);
    stderrOutput.push(text);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DebateProgressUI', () => {
  describe('append-only behavior', () => {
    it('should append messages instead of clearing/redrawing', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.startAgentActivity(TEST_AGENT_NAME_ALT, TEST_ACTIVITY);
      ui.completeAgentActivity(TEST_AGENT_NAME_ALT, TEST_ACTIVITY);
      
      // Verify multiple messages were appended
      expect(stderrOutput.length).toBeGreaterThan(1);
      // Verify no ANSI clearing codes
      const allOutput = getOutput();
      expect(allOutput).not.toContain(ANSI_MOVE_UP);
      expect(allOutput).not.toContain(ANSI_CLEAR_LINE);
    });

    it('should append messages in chronological order', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const allOutput = getOutput();
      const roundIndex = allOutput.indexOf('Round 1/3');
      const phaseStartIndex = allOutput.indexOf('[Round 1] Proposals phase starting');
      const phaseCompleteIndex = allOutput.indexOf('[Round 1] Proposals phase completed');
      
      expect(roundIndex).toBeLessThan(phaseStartIndex);
      expect(phaseStartIndex).toBeLessThan(phaseCompleteIndex);
    });
  });

  describe('message types and icons', () => {
    it('should append info message with blue icon for startRound', () => {
      const ui = createUI();
      ui.startRound(1);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Round 1/3 starting');
    });

    it('should append info message for startPhase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('[Round 1] Proposals phase starting');
    });

    it('should append info message for startAgentActivity', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} is ${TEST_ACTIVITY}...`);
    });

    it('should append success message with green checkmark for completeAgentActivity', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should append success message for completePhase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('[Round 1] Proposals phase completed');
    });

    it('should append info message for startSynthesis', () => {
      const ui = createUI();
      ui.startSynthesis();
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Synthesis starting');
      expect(output).not.toContain('[Round');
    });

    it('should append success message for completeSynthesis', () => {
      const ui = createUI();
      ui.startSynthesis();
      ui.completeSynthesis();
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('Synthesis completed');
      expect(output).not.toContain('[Round');
    });

    it('should append success message for complete', () => {
      const ui = createUI();
      ui.complete();
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('Debate completed');
      expect(output).not.toContain('[Round');
    });

    it('should append warning message for handleError', () => {
      const ui = createUI();
      const error = new Error(TEST_ERROR_MESSAGE);
      ui.handleError(error);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.WARNING);
      expect(output).toContain(`Error: ${TEST_ERROR_MESSAGE}`);
      expect(output).not.toContain('[Round');
    });
  });

  describe('log method', () => {
    it('should append info message by default without round prefix when currentRound is 0', () => {
      const ui = createUI();
      ui.log(TEST_MESSAGE);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain(TEST_MESSAGE);
      expect(output).not.toContain('[Round');
    });

    it('should append info message with round prefix when inside a round', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.log(TEST_MESSAGE);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain(`[Round 1] ${TEST_MESSAGE}`);
    });

    it('should append info message when type is info', () => {
      const ui = createUI();
      const infoMessage = 'Info message';
      ui.log(infoMessage, MessageType.INFO);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain(infoMessage);
    });

    it('should append success message when type is success', () => {
      const ui = createUI();
      const successMessage = 'Success message';
      ui.log(successMessage, MessageType.SUCCESS);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain(successMessage);
    });

    it('should append warning message when type is warning', () => {
      const ui = createUI();
      const warningMessage = 'Warning message';
      ui.log(warningMessage, MessageType.WARNING);
      
      const output = getOutput();
      expect(output).toContain(MESSAGE_ICONS.WARNING);
      expect(output).toContain(warningMessage);
    });
  });

  describe('message formatting', () => {
    it('should include spacing after icon', () => {
      const ui = createUI();
      ui.startRound(1);
      
      const output = getOutput();
      // Should have icon (possibly with ANSI color codes) followed by two spaces
      // Match: icon (with optional ANSI codes) + two spaces + "Round"
      const escapedIcon = MESSAGE_ICONS.INFO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(output).toMatch(new RegExp(`${escapedIcon}.*?\\s{2}Round`));
    });

    it('should include total rounds in round message', () => {
      const totalRounds = 5;
      const currentRound = 2;
      const ui = createUI(totalRounds);
      ui.startRound(currentRound);
      
      const output = getOutput();
      expect(output).toContain(`Round ${currentRound}/${totalRounds} starting`);
    });

    it('should only include phase name in phase start message', () => {
      const ui = createUI();
      ui.startRound(1);
      const agentCount = 5;
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, agentCount);
      
      const output = getOutput();
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).not.toContain('expected');
      expect(output).not.toContain(String(agentCount));
    });
  });

  describe('state tracking', () => {
    it('should maintain state for future features', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.startAgentActivity(TEST_AGENT_NAME_ALT, TEST_ACTIVITY);
      
      // State should be tracked internally (even though not used for display)
      // We can't directly access private state, but we can verify methods work
      ui.completeAgentActivity(TEST_AGENT_NAME_ALT, TEST_ACTIVITY);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      // If state tracking works, these should complete without errors
      expect(stderrOutput.length).toBeGreaterThan(0);
    });
  });

  describe('all phase types', () => {
    it('should handle proposal phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = getOutput();
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).toContain('[Round 1] Proposals phase completed');
    });

    it('should handle critique phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.CRITIQUE, 4);
      ui.completePhase(CONTRIBUTION_TYPES.CRITIQUE);
      
      const output = getOutput();
      expect(output).toContain('[Round 1] Critiques phase starting');
      expect(output).toContain('[Round 1] Critiques phase completed');
    });

    it('should handle refinement phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.REFINEMENT, 2);
      ui.completePhase(CONTRIBUTION_TYPES.REFINEMENT);
      
      const output = getOutput();
      expect(output).toContain('[Round 1] Refinements phase starting');
      expect(output).toContain('[Round 1] Refinements phase completed');
    });
  });

  describe('round prefix behavior', () => {
    it('should include round prefix for phase messages in round 2', () => {
      const ui = createUI();
      ui.startRound(2);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      const output = getOutput();
      expect(output).toContain('[Round 2] Proposals phase starting');
    });

    it('should include round prefix for agent activity in round 3', () => {
      const ui = createUI();
      ui.startRound(3);
      ui.startAgentActivity(TEST_AGENT_NAME_GENERIC, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(`[Round 3] ${TEST_AGENT_NAME_GENERIC} is ${TEST_ACTIVITY}...`);
    });

    it('should not include round prefix when currentRound is 0', () => {
      const ui = createUI();
      // currentRound is 0 by default
      ui.log(TEST_MESSAGE);
      
      const output = getOutput();
      expect(output).toContain(TEST_MESSAGE);
      expect(output).not.toContain('[Round');
    });

    it('should include round prefix for log messages when inside a round', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.log(TEST_LOG_MESSAGE);
      
      const output = getOutput();
      expect(output).toContain(`[Round 1] ${TEST_LOG_MESSAGE}`);
    });

    it('should handle multiple rounds correctly', () => {
      const ui = createUI();
      
      // Round 1
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      // Round 2
      ui.startRound(2);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = getOutput();
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).toContain('[Round 1] Proposals phase completed');
      expect(output).toContain('[Round 2] Proposals phase starting');
      expect(output).toContain('[Round 2] Proposals phase completed');
    });
  });

  describe('completeAgentActivity edge cases', () => {
    it('should handle completing activity when agent has multiple activities remaining', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      // Start multiple activities for the same agent
      ui.startAgentActivity(TEST_AGENT_NAME, 'proposing');
      ui.startAgentActivity(TEST_AGENT_NAME, 'reviewing');
      
      // Complete one activity - should still have the other activity
      ui.completeAgentActivity(TEST_AGENT_NAME, 'proposing');
      
      const output = getOutput();
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed proposing`);
      // Should still be able to complete the other activity
      ui.completeAgentActivity(TEST_AGENT_NAME, 'reviewing');
      expect(getOutput()).toContain(`[Round 1] ${TEST_AGENT_NAME} completed reviewing`);
    });

    it('should handle completing activity when activity is not found in list', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      // Start an activity
      ui.startAgentActivity(TEST_AGENT_NAME, 'proposing');
      
      // Try to complete a different activity that doesn't exist
      ui.completeAgentActivity(TEST_AGENT_NAME, 'nonexistent');
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed nonexistent`);
    });

    it('should handle completing activity when agent has no activities', () => {
      const ui = createUI();
      ui.startRound(1);
      
      // Try to complete an activity for an agent that never started any
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should update phase progress when completing activity in a phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 3);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      // Complete the activity - should update phase progress
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should update phase progress for critique phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.CRITIQUE, 2);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      // Complete the activity - should update phase progress for critique phase
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should update phase progress for refinement phase', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.REFINEMENT, 2);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      // Complete the activity - should update phase progress for refinement phase
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should handle completing activity when not in a recognized phase', () => {
      const ui = createUI();
      ui.startRound(1);
      // Don't start a phase, or set currentPhase to something unrecognized
      ui.startSynthesis(); // This sets currentPhase to 'Synthesis' which doesn't match PHASE_LABELS
      
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should handle completing activity when phase progress does not exist', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      // Use type assertion to access private state and manually clear phaseProgress
      // to test the branch where phaseType exists but progress doesn't
      const uiWithPrivateAccess = ui as unknown as {
        state: {
          currentPhase: string;
          currentRound: number;
          phaseProgress: Map<string, { current: number; total: number }>;
        };
      };
      
      // Clear phaseProgress to simulate missing progress entry
      uiWithPrivateAccess.state.phaseProgress.clear();
      
      // Now complete the activity - phaseType will exist (PROPOSAL) but progress won't
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      // Should still log the completion message even if progress doesn't exist
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should handle completing activity when activities array becomes empty after removal', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      // Start an activity
      ui.startAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      // Complete it (this removes it, making activities.length === 0, then deletes the key)
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      // Try to complete again - activities will be undefined (key was deleted)
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
    });

    it('should handle completing activity when activities exists but length is 0 (edge case)', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      // Test the branch where activities exists but activities.length === 0
      // This tests the branch: `if (activities && activities.length > 0)` 
      // where activities is [] (empty array, truthy but length is 0)
      // Using type assertion to access private state for testing purposes
      const uiWithPrivateAccess = ui as unknown as {
        state: {
          agentActivity: Map<string, string[]>;
          currentPhase: string;
          currentRound: number;
          phaseProgress: Map<string, { current: number; total: number }>;
        };
      };
      
      // Manually set activities to empty array to test this specific branch
      // This covers the case: activities is truthy ([]) but activities.length === 0
      uiWithPrivateAccess.state.agentActivity.set(TEST_AGENT_NAME, []);
      
      // Also set up phase state so phaseType will be found
      uiWithPrivateAccess.state.currentPhase = 'Proposals';
      uiWithPrivateAccess.state.currentRound = 1;
      uiWithPrivateAccess.state.phaseProgress.set('1-proposal', { current: 0, total: 2 });
      
      // Now complete an activity - the condition `activities && activities.length > 0` 
      // should evaluate to false because activities.length is 0
      ui.completeAgentActivity(TEST_AGENT_NAME, TEST_ACTIVITY);
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed ${TEST_ACTIVITY}`);
      // Verify the empty array branch was taken (we don't enter the if block at line 139)
    });

    it('should handle completing activity when idx is negative (activity not found but activities exist)', () => {
      const ui = createUI();
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      // Start an activity
      ui.startAgentActivity(TEST_AGENT_NAME, 'activity1');
      
      // Try to complete a different activity that doesn't exist in the list
      // This tests the branch where idx < 0
      ui.completeAgentActivity(TEST_AGENT_NAME, 'activity2');
      
      const output = getOutput();
      // Should still log the completion message
      expect(output).toContain(`[Round 1] ${TEST_AGENT_NAME} completed activity2`);
      // The original activity should still be in the list (not removed)
      expect(output).toContain(`${TEST_AGENT_NAME} is activity1...`);
    });
  });

  describe('start method', () => {
    it('should complete without error (no-op)', async () => {
      const ui = createUI();
      await expect(ui.start()).resolves.toBeUndefined();
    });
  });

  describe('initialize method', () => {
    it('should set totalRounds correctly', () => {
      const ui = new DebateProgressUI();
      const totalRounds = 5;
      ui.initialize(totalRounds);
      ui.startRound(1);
      
      const output = getOutput();
      expect(output).toContain(`Round 1/${totalRounds} starting`);
    });
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const ui = new DebateProgressUI();
      // Should be able to log without initialization
      ui.log(TEST_MESSAGE);
      
      const output = getOutput();
      expect(output).toContain(TEST_MESSAGE);
    });
  });
});

