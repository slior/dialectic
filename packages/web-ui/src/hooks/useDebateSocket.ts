'use client'

import { useEffect, useReducer, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import {
  DebateState,
  DebateAction,
  AgentState,
  AgentConfig,
  NotificationMessage,
  ACTION_TYPES,
} from '@/lib/types';

const DEFAULT_ROUNDS = 3;

const initialState: DebateState = {
  status: 'idle',
  problem: '',
  clarificationsEnabled: false,
  rounds: DEFAULT_ROUNDS,
  agents: [],
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

function debateReducer(state: DebateState, action: DebateAction): DebateState {
  switch (action.type) {
    case ACTION_TYPES.SET_PROBLEM:
      return { ...state, problem: action.payload };

    case ACTION_TYPES.SET_ROUNDS:
      return { ...state, rounds: action.payload };

    case ACTION_TYPES.TOGGLE_CLARIFICATIONS:
      return { ...state, clarificationsEnabled: !state.clarificationsEnabled };

    case ACTION_TYPES.CONNECTION_ESTABLISHED: {
      const agents: AgentState[] = action.payload.agents.map((cfg: AgentConfig) => ({
        id: cfg.id,
        name: cfg.name,
        role: cfg.role,
        contributions: [],
      }));
      return {
        ...state,
        agents,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Connected to debate server'),
        ],
      };
    }

    case ACTION_TYPES.DEBATE_STARTED:
      return {
        ...state,
        status: 'running',
        isRunning: true,
        solution: undefined,
        currentRound: 0,
        agents: state.agents.map(a => ({ ...a, contributions: [], currentActivity: undefined })),
        notifications: [
          ...state.notifications,
          createNotification('info', 'Debate started'),
        ],
      };

    case ACTION_TYPES.COLLECTING_CLARIFICATIONS:
      return {
        ...state,
        status: 'collecting_clarifications',
        notifications: [
          ...state.notifications,
          createNotification('info', 'Collecting clarifying questions from agents...'),
        ],
      };

    case ACTION_TYPES.CLARIFICATIONS_REQUIRED:
      return {
        ...state,
        status: 'awaiting_clarifications',
        clarificationQuestions: action.payload.questions,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Please answer the clarifying questions'),
        ],
      };

    case ACTION_TYPES.CLARIFICATIONS_SUBMITTED:
      return {
        ...state,
        status: 'running',
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

    case ACTION_TYPES.DEBATE_COMPLETE: {
      const result = action.payload;
      // Update agents with contributions from result
      const updatedAgents = state.agents.map(agent => {
        const agentContributions = result.rounds.flatMap(round =>
          round.contributions
            .filter(c => c.agentId === agent.id)
            .map(c => ({
              type: c.type,
              round: round.roundNumber,
              content: c.content,
            }))
        );
        return { ...agent, contributions: agentContributions, currentActivity: undefined };
      });

      return {
        ...state,
        status: 'completed',
        isRunning: false,
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
        status: 'error',
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
        status: 'idle',
        isRunning: false,
        clarificationQuestions: undefined,
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
    dispatch({ type: ACTION_TYPES.SET_PROBLEM, payload: problem });
    socketRef.current?.emit('startDebate', {
      problem: problem.trim(),
      clarificationsEnabled: state.clarificationsEnabled,
      rounds: state.rounds,
    });
  }, [state.clarificationsEnabled, state.rounds]);

  const submitClarifications = useCallback((answers: Record<string, string>) => {
    socketRef.current?.emit('submitClarifications', { answers });
  }, []);

  const cancelDebate = useCallback(() => {
    socketRef.current?.emit('cancelDebate');
  }, []);

  const clearNotification = useCallback((id: string) => {
    dispatch({ type: ACTION_TYPES.CLEAR_NOTIFICATION, payload: id });
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
  };
}

