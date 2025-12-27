'use client'

import { useEffect, useReducer, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import {
  DebateState,
  DebateAction,
  AgentState,
  AgentConfig,
  AgentConfigInput,
  NotificationMessage,
  ACTION_TYPES,
  ContributionType,
  DEBATE_STATUS,
} from '@/lib/types';

const DEFAULT_ROUNDS = 3;

const initialState: DebateState = {
  status: DEBATE_STATUS.IDLE,
  problem: '',
  clarificationsEnabled: false,
  rounds: DEFAULT_ROUNDS,
  agents: [],
  agentConfigs: [],
  configPanelCollapsed: false,
  currentRound: 0,
  totalRounds: DEFAULT_ROUNDS,
  notifications: [],
  isRunning: false,
};

function createNotification(type: NotificationMessage['type'], message: string): NotificationMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    message,
    timestamp: new Date(),
  };
}

function contributionKey(agentId: string, type: ContributionType, round: number, content: string): string {
  return `${agentId}-${type}-${round}-${content.slice(0, 50)}`; // Use first 50 chars as content identifier
}

function agentConfigToInput(cfg: AgentConfig): AgentConfigInput {
  return {
    id: cfg.id,
    name: cfg.name,
    role: cfg.role,
    model: cfg.model,
    provider: cfg.provider,
    temperature: cfg.temperature,
  };
}

function syncAgentsFromConfigs(configs: AgentConfigInput[]): AgentState[] {
  return configs.map(cfg => ({
    id: cfg.id,
    name: cfg.name,
    role: cfg.role,
    contributions: [],
    currentActivity: undefined,
  }));
}

function debateReducer(state: DebateState, action: DebateAction): DebateState {
  switch (action.type) {
    case ACTION_TYPES.SET_PROBLEM:
      return { ...state, problem: action.payload };

    case ACTION_TYPES.SET_ROUNDS:
      return { ...state, rounds: action.payload };

    case ACTION_TYPES.TOGGLE_CLARIFICATIONS:
      return { ...state, clarificationsEnabled: !state.clarificationsEnabled };

    case ACTION_TYPES.CONNECTION_ESTABLISHED: {
      const agentConfigs: AgentConfigInput[] = action.payload.agents.map(agentConfigToInput);
      const agents: AgentState[] = syncAgentsFromConfigs(agentConfigs);
      return {
        ...state,
        agentConfigs,
        agents,
        configPanelCollapsed: false,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Connected to debate server'),
        ],
      };
    }

    case ACTION_TYPES.DEBATE_STARTED: {
      // Sync agents from agentConfigs to ensure grid shows configured agents
      const syncedAgents = syncAgentsFromConfigs(state.agentConfigs);
      return {
        ...state,
        status: DEBATE_STATUS.RUNNING,
        isRunning: true,
        solution: undefined,
        currentRound: 0,
        agents: syncedAgents,
        configPanelCollapsed: true,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Debate started'),
        ],
      };
    }

    case ACTION_TYPES.COLLECTING_CLARIFICATIONS:
      return {
        ...state,
        status: DEBATE_STATUS.COLLECTING_CLARIFICATIONS,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Collecting clarifying questions from agents...'),
        ],
      };

    case ACTION_TYPES.CLARIFICATIONS_REQUIRED:
      return {
        ...state,
        status: DEBATE_STATUS.AWAITING_CLARIFICATIONS,
        clarificationQuestions: action.payload.questions,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Please answer the clarifying questions'),
        ],
      };

    case ACTION_TYPES.CLARIFICATIONS_SUBMITTED:
      return {
        ...state,
        status: DEBATE_STATUS.RUNNING,
        clarificationQuestions: undefined,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Clarifications submitted'),
        ],
      };

    case ACTION_TYPES.ROUND_START:
      return {
        ...state,
        currentRound: action.payload.round,
        totalRounds: action.payload.total,
        notifications: [
          ...state.notifications,
          createNotification('info', `Round ${action.payload.round}/${action.payload.total} starting`),
        ],
      };

    case ACTION_TYPES.PHASE_START:
      return {
        ...state,
        currentPhase: action.payload.phase,
        notifications: [
          ...state.notifications,
          createNotification('info', `${action.payload.phase} phase starting`),
        ],
      };

    case ACTION_TYPES.AGENT_START:
      return {
        ...state,
        agents: state.agents.map(a =>
          a.name === action.payload.agentName
            ? { ...a, currentActivity: action.payload.activity }
            : a
        ),
      };

    case ACTION_TYPES.AGENT_COMPLETE: {
      const { agentName, activity } = action.payload;
      return {
        ...state,
        agents: state.agents.map(a =>
          a.name === agentName
            ? { ...a, currentActivity: undefined }
            : a
        ),
        notifications: [
          ...state.notifications,
          createNotification('success', `${agentName} completed ${activity}`),
        ],
      };
    }

    case ACTION_TYPES.PHASE_COMPLETE:
      return {
        ...state,
        currentPhase: undefined,
        notifications: [
          ...state.notifications,
          createNotification('success', `${action.payload.phase} phase completed`),
        ],
      };

    case ACTION_TYPES.SYNTHESIS_START:
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Synthesizing final solution...'),
        ],
      };

    case ACTION_TYPES.SYNTHESIS_COMPLETE:
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Synthesis completed'),
        ],
      };

    case ACTION_TYPES.CONTRIBUTION_CREATED: {
      const { agentId, type, round, content } = action.payload;
      return {
        ...state,
        agents: state.agents.map(a => {
          if (a.id !== agentId) return a;
          
          // Check if contribution already exists
          const key = contributionKey(agentId, type, round, content);
          const existingKeys = new Set(
            a.contributions.map(c => contributionKey(agentId, c.type, c.round, c.content))
          );
          
          if (existingKeys.has(key)) {
            return a; // Contribution already exists, don't add duplicate
          }
          
          return {
            ...a,
            contributions: [...a.contributions, { type, round, content }],
          };
        }),
      };
    }

    case ACTION_TYPES.DEBATE_COMPLETE: {
      const result = action.payload;
      // Merge contributions from result with existing contributions, avoiding duplicates
      const updatedAgents = state.agents.map(agent => {
        // Get existing contribution keys
        const existingKeys = new Set(
          agent.contributions.map(c => contributionKey(agent.id, c.type, c.round, c.content))
        );
        
        // Add any missing contributions from the result
        const newContributions = result.rounds.flatMap(round =>
          round.contributions
            .filter(c => c.agentId === agent.id)
            .map(c => ({
              type: c.type,
              round: round.roundNumber,
              content: c.content,
            }))
            .filter(c => {
              const key = contributionKey(agent.id, c.type, c.round, c.content);
              return !existingKeys.has(key);
            })
        );
        
        return { 
          ...agent, 
          contributions: [...agent.contributions, ...newContributions], 
          currentActivity: undefined 
        };
      });
      
      return {
        ...state,
        status: DEBATE_STATUS.COMPLETED,
        isRunning: false,
        configPanelCollapsed: false,
        solution: result.solution,
        agents: updatedAgents,
        notifications: [
          ...state.notifications,
          createNotification('success', `Debate completed in ${result.metadata.durationMs}ms`),
        ],
      };
    }

    case ACTION_TYPES.ERROR:
      return {
        ...state,
        status: DEBATE_STATUS.ERROR,
        isRunning: false,
        currentPhase: undefined,
        agents: state.agents.map(a => ({ ...a, currentActivity: undefined })),
        notifications: [
          ...state.notifications,
          createNotification('error', action.payload.message),
        ],
      };

    case ACTION_TYPES.WARNING:
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('warning', action.payload.message),
        ],
      };

    case ACTION_TYPES.DEBATE_CANCELLED:
      return {
        ...state,
        status: DEBATE_STATUS.IDLE,
        isRunning: false,
        clarificationQuestions: undefined,
        configPanelCollapsed: false,
        agents: state.agents.map(a => ({ ...a, currentActivity: undefined })),
        notifications: [
          ...state.notifications,
          createNotification('warning', 'Debate cancelled'),
        ],
      };

    case ACTION_TYPES.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };

    case ACTION_TYPES.CLEAR_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };

    case ACTION_TYPES.SET_AGENT_CONFIGS:
      return {
        ...state,
        agentConfigs: action.payload,
      };

    case ACTION_TYPES.UPDATE_AGENT_CONFIG: {
      const updated = [...state.agentConfigs];
      updated[action.payload.index] = action.payload.agent;
      return {
        ...state,
        agentConfigs: updated,
      };
    }

    case ACTION_TYPES.ADD_AGENT_CONFIG:
      return {
        ...state,
        agentConfigs: [...state.agentConfigs, action.payload],
      };

    case ACTION_TYPES.REMOVE_AGENT_CONFIG:
      return {
        ...state,
        agentConfigs: state.agentConfigs.filter((_, i) => i !== action.payload),
      };

    case ACTION_TYPES.SET_CONFIG_PANEL_COLLAPSED:
      return {
        ...state,
        configPanelCollapsed: action.payload,
      };

    default:
      return state;
  }
}

export function useDebateSocket() {
  const [state, dispatch] = useReducer(debateReducer, initialState);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Connection events
    socket.on('connectionEstablished', (data) => {
      dispatch({ type: ACTION_TYPES.CONNECTION_ESTABLISHED, payload: data });
    });

    // Handle socket connection (including reconnections)
    socket.on('connect', () => {
      // The server should automatically emit 'connectionEstablished' via handleConnection
    });

    // If socket is disconnected, try to connect manually
    if (!socket.connected && socket.disconnected) {
      socket.connect();
    }

    // Debate lifecycle events
    socket.on('debateStarted', () => {
      dispatch({ type: ACTION_TYPES.DEBATE_STARTED });
    });

    socket.on('collectingClarifications', () => {
      dispatch({ type: ACTION_TYPES.COLLECTING_CLARIFICATIONS });
    });

    socket.on('clarificationsRequired', (data) => {
      dispatch({ type: ACTION_TYPES.CLARIFICATIONS_REQUIRED, payload: data });
    });

    socket.on('clarificationsSubmitted', () => {
      dispatch({ type: ACTION_TYPES.CLARIFICATIONS_SUBMITTED });
    });

    // Progress events
    socket.on('roundStart', (data) => {
      dispatch({ type: ACTION_TYPES.ROUND_START, payload: data });
    });

    socket.on('phaseStart', (data) => {
      dispatch({ type: ACTION_TYPES.PHASE_START, payload: data });
    });

    socket.on('agentStart', (data) => {
      dispatch({ type: ACTION_TYPES.AGENT_START, payload: data });
    });

    socket.on('agentComplete', (data) => {
      dispatch({ type: ACTION_TYPES.AGENT_COMPLETE, payload: data });
    });

    socket.on('phaseComplete', (data) => {
      dispatch({ type: ACTION_TYPES.PHASE_COMPLETE, payload: data });
    });

    socket.on('synthesisStart', () => {
      dispatch({ type: ACTION_TYPES.SYNTHESIS_START });
    });

    socket.on('synthesisComplete', () => {
      dispatch({ type: ACTION_TYPES.SYNTHESIS_COMPLETE });
    });

    socket.on('debateComplete', (data) => {
      dispatch({ type: ACTION_TYPES.DEBATE_COMPLETE, payload: data });
    });

    socket.on('contributionCreated', (data) => {
      dispatch({ type: ACTION_TYPES.CONTRIBUTION_CREATED, payload: data });
    });

    // Error events
    socket.on('error', (data) => {
      dispatch({ type: ACTION_TYPES.ERROR, payload: data });
    });

    socket.on('warning', (data) => {
      dispatch({ type: ACTION_TYPES.WARNING, payload: data });
    });

    socket.on('debateCancelled', () => {
      dispatch({ type: ACTION_TYPES.DEBATE_CANCELLED });
    });

    return () => {
      disconnectSocket();
    };
  }, []);

  const setProblem = useCallback((problem: string) => {
    dispatch({ type: ACTION_TYPES.SET_PROBLEM, payload: problem });
  }, []);

  const setRounds = useCallback((rounds: number) => {
    dispatch({ type: ACTION_TYPES.SET_ROUNDS, payload: rounds });
  }, []);

  const toggleClarifications = useCallback(() => {
    dispatch({ type: ACTION_TYPES.TOGGLE_CLARIFICATIONS });
  }, []);

  const startDebate = useCallback((problem: string) => {
    if (!problem.trim()) return;
    if (state.agentConfigs.length === 0) {
      dispatch({
        type: ACTION_TYPES.ERROR,
        payload: { message: 'No agents configured. Please add at least one agent.' },
      });
      return;
    }
    dispatch({ type: ACTION_TYPES.SET_PROBLEM, payload: problem });
    socketRef.current?.emit('startDebate', {
      problem: problem.trim(),
      clarificationsEnabled: state.clarificationsEnabled,
      rounds: state.rounds,
      agents: state.agentConfigs,
    });
  }, [state.clarificationsEnabled, state.rounds, state.agentConfigs]);

  const submitClarifications = useCallback((answers: Record<string, string>) => {
    socketRef.current?.emit('submitClarifications', { answers });
  }, []);

  const cancelDebate = useCallback(() => {
    socketRef.current?.emit('cancelDebate');
  }, []);

  const clearNotification = useCallback((id: string) => {
    dispatch({ type: ACTION_TYPES.CLEAR_NOTIFICATION, payload: id });
  }, []);

  const setAgentConfigs = useCallback((configs: AgentConfigInput[]) => {
    dispatch({ type: ACTION_TYPES.SET_AGENT_CONFIGS, payload: configs });
  }, []);

  const updateAgentConfig = useCallback((index: number, agent: AgentConfigInput) => {
    dispatch({ type: ACTION_TYPES.UPDATE_AGENT_CONFIG, payload: { index, agent } });
  }, []);

  const addAgentConfig = useCallback((agent: AgentConfigInput) => {
    dispatch({ type: ACTION_TYPES.ADD_AGENT_CONFIG, payload: agent });
  }, []);

  const removeAgentConfig = useCallback((index: number) => {
    dispatch({ type: ACTION_TYPES.REMOVE_AGENT_CONFIG, payload: index });
  }, []);

  return {
    state,
    setProblem,
    setRounds,
    toggleClarifications,
    startDebate,
    submitClarifications,
    cancelDebate,
    clearNotification,
    setAgentConfigs,
    updateAgentConfig,
    addAgentConfig,
    removeAgentConfig,
  };
}

