import {
  ContributionType,
  CONTRIBUTION_TYPES,
  MessageType,
  logInfo,
  logSuccess,
  logWarning,
} from 'dialectic-core';

// Constants for UI strings and configuration
const PHASE_LABELS = {
  [CONTRIBUTION_TYPES.PROPOSAL]: 'Proposals',
  [CONTRIBUTION_TYPES.CRITIQUE]: 'Critiques',
  [CONTRIBUTION_TYPES.REFINEMENT]: 'Refinements',
} as const;

const SYNTHESIS_LABEL = 'Synthesis';

// Progress state tracking
// Note: State is maintained for potential future advanced UI features (e.g., interactive display, progress bars).
// Currently, state is not used for display rendering as we use an append-only log approach.
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
 * This class provides an append-only log-style progress indicator that shows:
 * - Round and phase transitions
 * - Individual agent activities
 * - Completion status for activities and phases
 * 
 * Messages are appended chronologically with colored icons:
 * - Info messages (blue ℹ): Round start, phase start, agent activity start, synthesis start
 * - Success messages (green ✓): Activity completion, phase completion, synthesis completion
 * - Warning messages (yellow ⚠): Errors and warnings
 * 
 * The UI writes to stderr to maintain separation from stdout.
 * Output uses an append-only approach - messages are never cleared or redrawn.
 */
export class DebateProgressUI {
  private state: ProgressState;
  private totalRounds: number = 0;

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
    // No-op for append-only approach
  }

  /**
   * Writes a log message to stderr with appropriate icon and color based on message type.
   * 
   * @param message - The message text to log.
   * @param type - The message type (MessageType enum value). Defaults to MessageType.INFO.
   */
  log(message: string, type: MessageType = MessageType.INFO): void {
    const formattedMessage = this.formatMessageWithRound(message, type);
    this.appendMessage(formattedMessage, type);
  }

  /**
   * Signals the start of a new debate round.
   * 
   * @param roundNumber - The round number (1-indexed).
   */
  startRound(roundNumber: number): void {
    this.state.currentRound = roundNumber;
    this.state.currentPhase = '';
    this.appendMessage(`Round ${roundNumber}/${this.totalRounds} starting`, MessageType.INFO);
  }

  /**
   * Signals the start of a phase within the current round.
   * 
   * @param phase - The phase type (proposal, critique, or refinement).
   * @param expectedAgentCount - Expected number of agent tasks in this phase (tracked for future features).
   */
  startPhase(phase: ContributionType, expectedAgentCount: number): void {
    const phaseLabel = PHASE_LABELS[phase];
    this.state.currentPhase = phaseLabel;
    const phaseKey = `${this.state.currentRound}-${phase}`;
    this.state.phaseProgress.set(phaseKey, { current: 0, total: expectedAgentCount });
    this.state.agentActivity.clear();
    const message = this.formatMessageWithRound(`${phaseLabel} phase starting`, MessageType.INFO);
    this.appendMessage(message, MessageType.INFO);
  }

  /**
   * Signals that an agent has started an activity.
   * 
   * @param agentName - The name of the agent.
   * @param activity - Description of the activity (e.g., "proposing", "critiquing architect"). Multiple activities per agent are supported.
   */
  startAgentActivity(agentName: string, activity: string): void {
    // Append activity into Map<agentName, activities[]> (for future features)
    const activities = this.state.agentActivity.get(agentName) ?? [];
    activities.push(activity);
    this.state.agentActivity.set(agentName, activities);
    const message = this.formatMessageWithRound(`${agentName} is ${activity}...`, MessageType.INFO);
    this.appendMessage(message, MessageType.INFO);
  }

  /**
   * Signals that an agent has completed an activity.
   * 
   * @param agentName - The name of the agent.
   * @param activity - Description of the activity to complete. Removes a single matching occurrence.
   */
  completeAgentActivity(agentName: string, activity: string): void {
    // Remove a single occurrence of the activity from the agent's list; delete key if list becomes empty (for future features)
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
    
    // Update phase progress (for future features)
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
    
    const message = this.formatMessageWithRound(`${agentName} completed ${activity}`, MessageType.SUCCESS);
    this.appendMessage(message, MessageType.SUCCESS);
  }

  /**
   * Signals that a phase has completed.
   * 
   * @param phase - The phase type that completed.
   */
  completePhase(phase: ContributionType): void {
    const phaseLabel = PHASE_LABELS[phase];
    this.state.currentPhase = '';
    this.state.agentActivity.clear();
    const message = this.formatMessageWithRound(`${phaseLabel} phase completed`, MessageType.SUCCESS);
    this.appendMessage(message, MessageType.SUCCESS);
  }

  /**
   * Signals the start of the synthesis phase.
   */
  startSynthesis(): void {
    this.state.currentPhase = SYNTHESIS_LABEL;
    this.state.agentActivity.clear();
    this.appendMessage('Synthesis starting', MessageType.INFO);
  }

  /**
   * Signals that synthesis has completed.
   */
  completeSynthesis(): void {
    this.state.currentPhase = '';
    this.appendMessage('Synthesis completed', MessageType.SUCCESS);
  }

  /**
   * Completes the entire progress UI.
   * Should be called when the debate finishes.
   */
  async complete(): Promise<void> {
    this.appendMessage('Debate completed', MessageType.SUCCESS);
  }

  /**
   * Handles errors in the progress UI.
   * 
   * @param error - The error that occurred.
   */
  handleError(error: Error): void {
    this.appendMessage(`Error: ${error.message}`, MessageType.WARNING);
  }

  /**
   * Prepends round prefix to messages that occur within an active round.
   * Checks if we're inside an active round (currentRound > 0) before prepending round prefix.
   * Round-scoped messages (phases, agent activities) get the prefix, while non-round messages
   * (synthesis, errors, debate completion) do not.
   * 
   * @param message - The message text to potentially prefix.
   * @param _type - The message type (unused, but kept for consistency with formatMessage signature).
   * @returns Message with round prefix if inside an active round, otherwise unchanged message.
   */
  private formatMessageWithRound(message: string, _type: MessageType): string {
    // Check if we're inside an active round (currentRound > 0) before prepending round prefix.
    // Round-scoped messages (phases, agent activities) get the prefix, while non-round messages
    // (synthesis, errors, debate completion) do not.
    if (this.state.currentRound > 0) {
      return `[Round ${this.state.currentRound}] ${message}`;
    }
    return message;
  }

  /**
   * Appends a formatted message to stderr using unified formatting.
   * 
   * @param message - The message text to append.
   * @param type - The message type (info, success, or warning). Defaults to info.
   */
  private appendMessage(message: string, type: MessageType = MessageType.INFO): void {
    if (type === MessageType.INFO) {
      logInfo(message);
    } else if (type === MessageType.SUCCESS) {
      logSuccess(message);
    } else if (type === MessageType.WARNING) {
      logWarning(message);
    }
  }
}
