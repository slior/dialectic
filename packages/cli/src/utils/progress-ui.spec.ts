import { DebateProgressUI } from './progress-ui';
import { MessageType, MESSAGE_ICONS, CONTRIBUTION_TYPES } from 'dialectic-core';

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
});

