import { ContributionType, CONTRIBUTION_TYPES } from '../types/debate.types';
import { writeStderr } from './console';

// Lazy load chalk for optional color support
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  // If chalk is not available, create a pass-through mock
  chalk = new Proxy({}, {
    get: () => (text: string) => text
  });
}

// Constants for UI strings and configuration
const PHASE_LABELS = {
  [CONTRIBUTION_TYPES.PROPOSAL]: 'Proposals',
  [CONTRIBUTION_TYPES.CRITIQUE]: 'Critiques',
  [CONTRIBUTION_TYPES.REFINEMENT]: 'Refinements',
} as const;

const SYNTHESIS_LABEL = 'Synthesis';

// ANSI escape codes for terminal control
const ANSI_MOVE_UP = '\x1b[1A';     // Move cursor up one line
const ANSI_CLEAR_LINE = '\x1b[2K';  // Clear entire line

// UI styling constants
const SPINNER_ICON = '⠋';
const SUMMARIZATION_SECTION_LABEL = 'Summarization';
const COLOR_STRUCTURE = chalk.blue;      // Blue for lines and round header
const COLOR_SPINNER = chalk.cyan;        // Cyan (lighter blue) for spinner icon

// Progress state tracking
interface ProgressState {
  currentRound: number;
  currentPhase: string;
  /** Map of agent names to their list of current activities (e.g., ["proposing", "critiquing architect"]) */
  agentActivity: Map<string, string[]>;
  /** Map of phase keys to progress counts (e.g., "1-proposal" -> { current: 2, total: 3 }) */
  phaseProgress: Map<string, { current: number; total: number }>;
}

/**
 * DebateProgressUI manages the real-time progress display for debate execution.
 * 
 * This class provides a simple text-based progress indicator that shows:
 * - Current round and phase
 * - Individual agent activities
 * - Progress counts for each phase
 * 
 * The UI writes to stderr to maintain separation from stdout.
 * Output is designed to be simple and informative without complex rendering.
 */
export class DebateProgressUI {
  private state: ProgressState;
  private totalRounds: number = 0;
  private lastOutput: string = '';

  constructor() {
    this.state = {
      currentRound: 0,
      currentPhase: '',
      agentActivity: new Map<string, string[]>(),
      phaseProgress: new Map(),
    };
  }

  /**
   * Initializes the progress UI with debate configuration.
   * 
   * @param totalRounds - Total number of rounds in the debate.
   */
  initialize(totalRounds: number): void {
    this.totalRounds = totalRounds;
  }

  /**
   * Starts the progress UI display.
   * Must be called after initialize() and before any round/phase updates.
   */
  async start(): Promise<void> {
    // Clear any previous output
    this.clearOutput();
  }

  /**
   * Writes a log message to stderr without leaving orphaned UI artifacts.
   * Clears the current UI, writes the message, then redraws the UI.
   */
  log(message: string): void {
    this.clearOutput();
    const text = message.endsWith('\n') ? message : `${message}\n`;
    writeStderr(text);
    this.updateDisplay();
  }

  /**
   * Signals the start of a new debate round.
   * 
   * @param roundNumber - The round number (1-indexed).
   */
  startRound(roundNumber: number): void {
    this.state.currentRound = roundNumber;
    this.state.currentPhase = '';
    this.updateDisplay();
  }

  /**
   * Signals the start of a phase within the current round.
   * 
   * @param phase - The phase type (proposal, critique, or refinement).
   * @param expectedAgentCount - Expected number of agent tasks in this phase.
   */
  startPhase(phase: ContributionType, expectedAgentCount: number): void {
    const phaseLabel = PHASE_LABELS[phase];
    this.state.currentPhase = phaseLabel;
    const phaseKey = `${this.state.currentRound}-${phase}`;
    this.state.phaseProgress.set(phaseKey, { current: 0, total: expectedAgentCount });
    this.state.agentActivity.clear();
    this.updateDisplay();
  }

  /**
   * Signals that an agent has started an activity.
   * 
   * @param agentName - The name of the agent.
   * @param activity - Description of the activity (e.g., "proposing", "critiquing architect"). Multiple activities per agent are supported.
   */
  startAgentActivity(agentName: string, activity: string): void {
    // Append activity into Map<agentName, activities[]>
    const activities = this.state.agentActivity.get(agentName) ?? [];
    activities.push(activity);
    this.state.agentActivity.set(agentName, activities);
    this.updateDisplay();
  }

  /**
   * Signals that an agent has completed an activity.
   * 
   * @param agentName - The name of the agent.
   * @param activity - Description of the activity to complete. Removes a single matching occurrence.
   */
  completeAgentActivity(agentName: string, activity: string): void {
    // Remove a single occurrence of the activity from the agent's list; delete key if list becomes empty
    const activities = this.state.agentActivity.get(agentName);
    if (activities && activities.length > 0) {
      const idx = activities.indexOf(activity);
      if (idx >= 0) {
        activities.splice(idx, 1);
      }
      if (activities.length === 0) {
        this.state.agentActivity.delete(agentName);
      } else {
        this.state.agentActivity.set(agentName, activities);
      }
    }
    
    // Update phase progress
    const currentPhase = this.state.currentPhase.toLowerCase();
    const phaseType = Object.keys(PHASE_LABELS).find(
      key => PHASE_LABELS[key as ContributionType].toLowerCase() === currentPhase
    ) as ContributionType | undefined;
    
    if (phaseType) {
      const phaseKey = `${this.state.currentRound}-${phaseType}`;
      const progress = this.state.phaseProgress.get(phaseKey);
      if (progress) {
        progress.current++;
        this.state.phaseProgress.set(phaseKey, progress);
      }
    }
    
    this.updateDisplay();
  }

  /**
   * Signals that a phase has completed.
   * 
   * @param _phase - The phase type that completed (reserved for future use).
   */
  completePhase(_phase: ContributionType): void {
    this.state.currentPhase = '';
    this.state.agentActivity.clear();
    this.updateDisplay();
  }

  /**
   * Signals the start of the synthesis phase.
   */
  startSynthesis(): void {
    this.state.currentPhase = SYNTHESIS_LABEL;
    this.state.agentActivity.clear();
    this.updateDisplay();
  }

  /**
   * Signals that synthesis has completed.
   */
  completeSynthesis(): void {
    this.state.currentPhase = '';
    this.updateDisplay();
  }

  /**
   * Completes the entire progress UI.
   * Should be called when the debate finishes.
   */
  async complete(): Promise<void> {
    this.clearOutput();
  }

  /**
   * Handles errors in the progress UI.
   * 
   * @param _error - The error that occurred (reserved for future use).
   */
  handleError(_error: Error): void {
    // Error handling can be added here if needed
    this.clearOutput();
  }

  /**
   * Updates the progress display with current state.
   */
  private updateDisplay(): void {
    let output = this.buildProgressText();
    
    // Only update if output has changed
    if (output !== this.lastOutput) {
      this.clearOutput();
      writeStderr(output);
      this.lastOutput = output;
    }
  }

  /**
   * Builds the progress text from current state.
   */
  private buildProgressText(): string {
    if (this.state.currentRound === 0) {
      return '';
    }

    const lines: string[] = [];
    
    // Round progress with blue color
    lines.push(COLOR_STRUCTURE(`┌─ Round ${this.state.currentRound}/${this.totalRounds}`));
    
    // Current phase
    if (this.state.currentPhase) {
      const currentPhase = this.state.currentPhase.toLowerCase();
      const phaseType = Object.keys(PHASE_LABELS).find(
        key => PHASE_LABELS[key as ContributionType].toLowerCase() === currentPhase
      ) as ContributionType | undefined;
      
      let phaseText = `${this.state.currentPhase}`;
      
      if (phaseType) {
        const phaseKey = `${this.state.currentRound}-${phaseType}`;
        const progress = this.state.phaseProgress.get(phaseKey);
        if (progress) {
          phaseText += ` (${progress.current}/${progress.total})`;
        }
      }
      
      lines.push(COLOR_STRUCTURE('│  ') + phaseText);
      
      // Active agent activities with colored spinner
      if (this.state.agentActivity.size > 0) {
        // Map.forEach callback receives (value, key) = (activities[], agentName)
        this.state.agentActivity.forEach((activities, agentName) => {
          activities.forEach((activity) => {
            lines.push(COLOR_STRUCTURE('│  ') + COLOR_SPINNER(SPINNER_ICON) + ` ${agentName} ${activity}...`);
          });
        });
      }
    } else if (this.state.agentActivity.size > 0) {
      // No active phase, but there are activities (e.g., summarization)
      lines.push(COLOR_STRUCTURE('│  ') + SUMMARIZATION_SECTION_LABEL);
      this.state.agentActivity.forEach((activities, agentName) => {
        activities.forEach((activity) => {
          lines.push(COLOR_STRUCTURE('│  ') + COLOR_SPINNER(SPINNER_ICON) + ` ${agentName} ${activity}...`);
        });
      });
    }
    
    lines.push(COLOR_STRUCTURE('└─'));
    
    // Return with newline at end so cursor is on next line
    return lines.join('\n') + '\n';
  }

  /**
   * Clears the previous output from the terminal.
   */
  private clearOutput(): void {
    if (this.lastOutput) {
      // Count lines in last output (number of newlines = number of lines)
      const lineCount = (this.lastOutput.match(/\n/g) || []).length;
      
      // Move cursor up and clear each line
      // Since output ends with \n, cursor is on empty line after content
      // We need to clear that line first, then move up and clear each content line
      for (let i = 0; i < lineCount; i++) {
        writeStderr(ANSI_MOVE_UP);
        writeStderr(ANSI_CLEAR_LINE);
      }
      
      this.lastOutput = '';
    }
  }
}
