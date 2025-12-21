import { DebateProgressUI } from './progress-ui';
import { MessageType, MESSAGE_ICONS, CONTRIBUTION_TYPES } from '@dialectic/core';

// Mock process.stderr.write to capture output
let stderrOutput: string[] = [];

beforeEach(() => {
  stderrOutput = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((...args: unknown[]) => {
    const text = args[0] as string;
    stderrOutput.push(text);
    return true;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DebateProgressUI', () => {
  describe('append-only behavior', () => {
    it('should append messages instead of clearing/redrawing', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.startAgentActivity('Agent1', 'proposing');
      ui.completeAgentActivity('Agent1', 'proposing');
      
      // Verify multiple messages were appended
      expect(stderrOutput.length).toBeGreaterThan(1);
      // Verify no ANSI clearing codes
      const allOutput = stderrOutput.join('');
      expect(allOutput).not.toContain('\x1b[1A'); // ANSI_MOVE_UP
      expect(allOutput).not.toContain('\x1b[2K'); // ANSI_CLEAR_LINE
    });

    it('should append messages in chronological order', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const allOutput = stderrOutput.join('');
      const roundIndex = allOutput.indexOf('Round 1/3');
      const phaseStartIndex = allOutput.indexOf('[Round 1] Proposals phase starting');
      const phaseCompleteIndex = allOutput.indexOf('[Round 1] Proposals phase completed');
      
      expect(roundIndex).toBeLessThan(phaseStartIndex);
      expect(phaseStartIndex).toBeLessThan(phaseCompleteIndex);
    });
  });

  describe('message types and icons', () => {
    it('should append info message with blue icon for startRound', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Round 1/3 starting');
    });

    it('should append info message for startPhase', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('[Round 1] Proposals phase starting');
    });

    it('should append info message for startAgentActivity', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startAgentActivity('System Architect', 'proposing');
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('[Round 1] System Architect is proposing...');
    });

    it('should append success message with green checkmark for completeAgentActivity', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startAgentActivity('System Architect', 'proposing');
      ui.completeAgentActivity('System Architect', 'proposing');
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('[Round 1] System Architect completed proposing');
    });

    it('should append success message for completePhase', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('[Round 1] Proposals phase completed');
    });

    it('should append info message for startSynthesis', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startSynthesis();
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Synthesis starting');
      expect(output).not.toContain('[Round');
    });

    it('should append success message for completeSynthesis', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startSynthesis();
      ui.completeSynthesis();
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('Synthesis completed');
      expect(output).not.toContain('[Round');
    });

    it('should append success message for complete', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.complete();
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('Debate completed');
      expect(output).not.toContain('[Round');
    });

    it('should append warning message for handleError', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      const error = new Error('Test error');
      ui.handleError(error);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.WARNING);
      expect(output).toContain('Error: Test error');
      expect(output).not.toContain('[Round');
    });
  });

  describe('log method', () => {
    it('should append info message by default without round prefix when currentRound is 0', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.log('Test message');
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Test message');
      expect(output).not.toContain('[Round');
    });

    it('should append info message with round prefix when inside a round', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.log('Test message');
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('[Round 1] Test message');
    });

    it('should append info message when type is info', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.log('Info message', MessageType.INFO);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.INFO);
      expect(output).toContain('Info message');
    });

    it('should append success message when type is success', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.log('Success message', MessageType.SUCCESS);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.SUCCESS);
      expect(output).toContain('Success message');
    });

    it('should append warning message when type is warning', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.log('Warning message', MessageType.WARNING);
      
      const output = stderrOutput.join('');
      expect(output).toContain(MESSAGE_ICONS.WARNING);
      expect(output).toContain('Warning message');
    });
  });

  describe('message formatting', () => {
    it('should include spacing after icon', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      
      const output = stderrOutput.join('');
      // Should have icon (possibly with ANSI color codes) followed by two spaces
      // Match: icon (with optional ANSI codes) + two spaces + "Round"
      const escapedIcon = MESSAGE_ICONS.INFO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(output).toMatch(new RegExp(`${escapedIcon}.*?\\s{2}Round`));
    });

    it('should include total rounds in round message', () => {
      const ui = new DebateProgressUI();
      ui.initialize(5);
      ui.startRound(2);
      
      const output = stderrOutput.join('');
      expect(output).toContain('Round 2/5 starting');
    });

    it('should only include phase name in phase start message', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 5);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).not.toContain('expected');
      expect(output).not.toContain('5');
    });
  });

  describe('state tracking', () => {
    it('should maintain state for future features', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.startAgentActivity('Agent1', 'proposing');
      
      // State should be tracked internally (even though not used for display)
      // We can't directly access private state, but we can verify methods work
      ui.completeAgentActivity('Agent1', 'proposing');
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      // If state tracking works, these should complete without errors
      expect(stderrOutput.length).toBeGreaterThan(0);
    });
  });

  describe('all phase types', () => {
    it('should handle proposal phase', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).toContain('[Round 1] Proposals phase completed');
    });

    it('should handle critique phase', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.CRITIQUE, 4);
      ui.completePhase(CONTRIBUTION_TYPES.CRITIQUE);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Critiques phase starting');
      expect(output).toContain('[Round 1] Critiques phase completed');
    });

    it('should handle refinement phase', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.REFINEMENT, 2);
      ui.completePhase(CONTRIBUTION_TYPES.REFINEMENT);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Refinements phase starting');
      expect(output).toContain('[Round 1] Refinements phase completed');
    });
  });

  describe('round prefix behavior', () => {
    it('should include round prefix for phase messages in round 2', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(2);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 2] Proposals phase starting');
    });

    it('should include round prefix for agent activity in round 3', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(3);
      ui.startAgentActivity('Test Agent', 'proposing');
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 3] Test Agent is proposing...');
    });

    it('should not include round prefix when currentRound is 0', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      // currentRound is 0 by default
      ui.log('Test message');
      
      const output = stderrOutput.join('');
      expect(output).toContain('Test message');
      expect(output).not.toContain('[Round');
    });

    it('should include round prefix for log messages when inside a round', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      ui.startRound(1);
      ui.log('Test log message');
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Test log message');
    });

    it('should handle multiple rounds correctly', () => {
      const ui = new DebateProgressUI();
      ui.initialize(3);
      
      // Round 1
      ui.startRound(1);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      // Round 2
      ui.startRound(2);
      ui.startPhase(CONTRIBUTION_TYPES.PROPOSAL, 2);
      ui.completePhase(CONTRIBUTION_TYPES.PROPOSAL);
      
      const output = stderrOutput.join('');
      expect(output).toContain('[Round 1] Proposals phase starting');
      expect(output).toContain('[Round 1] Proposals phase completed');
      expect(output).toContain('[Round 2] Proposals phase starting');
      expect(output).toContain('[Round 2] Proposals phase completed');
    });
  });
});

