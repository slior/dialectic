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
  AgentClarifications,
} from '@/lib/types';

const initialState: DebateState = {
  status: 'idle',
  problem: '',
  clarificationsEnabled: false,
  agents: [],
  currentRound: 0,
  totalRounds: 3,
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
    case 'SET_PROBLEM':
      return { ...state, problem: action.payload };

    case 'TOGGLE_CLARIFICATIONS':
      return { ...state, clarificationsEnabled: !state.clarificationsEnabled };

    case 'CONNECTION_ESTABLISHED': {
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

    case 'DEBATE_STARTED':
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

    case 'COLLECTING_CLARIFICATIONS':
      return {
        ...state,
        status: 'collecting_clarifications',
        notifications: [
          ...state.notifications,
          createNotification('info', 'Collecting clarifying questions from agents...'),
        ],
      };

    case 'CLARIFICATIONS_REQUIRED':
      return {
        ...state,
        status: 'awaiting_clarifications',
        clarificationQuestions: action.payload.questions,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Please answer the clarifying questions'),
        ],
      };

    case 'CLARIFICATIONS_SUBMITTED':
      return {
        ...state,
        status: 'running',
        clarificationQuestions: undefined,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Clarifications submitted'),
        ],
      };

    case 'ROUND_START':
      return {
        ...state,
        currentRound: action.payload.round,
        totalRounds: action.payload.total,
        notifications: [
          ...state.notifications,
          createNotification('info', `Round ${action.payload.round}/${action.payload.total} starting`),
        ],
      };

    case 'PHASE_START':
      return {
        ...state,
        currentPhase: action.payload.phase,
        notifications: [
          ...state.notifications,
          createNotification('info', `${action.payload.phase} phase starting`),
        ],
      };

    case 'AGENT_START':
      return {
        ...state,
        agents: state.agents.map(a =>
          a.name === action.payload.agentName
            ? { ...a, currentActivity: action.payload.activity }
            : a
        ),
      };

    case 'AGENT_COMPLETE': {
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

    case 'PHASE_COMPLETE':
      return {
        ...state,
        currentPhase: undefined,
        notifications: [
          ...state.notifications,
          createNotification('success', `${action.payload.phase} phase completed`),
        ],
      };

    case 'SYNTHESIS_START':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('info', 'Synthesizing final solution...'),
        ],
      };

    case 'SYNTHESIS_COMPLETE':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('success', 'Synthesis completed'),
        ],
      };

    case 'DEBATE_COMPLETE': {
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

    case 'ERROR':
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

    case 'WARNING':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          createNotification('warning', action.payload.message),
        ],
      };

    case 'DEBATE_CANCELLED':
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

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };

    case 'CLEAR_NOTIFICATION':
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
      dispatch({ type: 'CONNECTION_ESTABLISHED', payload: data });
    });

    // Debate lifecycle events
    socket.on('debateStarted', () => {
      dispatch({ type: 'DEBATE_STARTED' });
    });

    socket.on('collectingClarifications', () => {
      dispatch({ type: 'COLLECTING_CLARIFICATIONS' });
    });

    socket.on('clarificationsRequired', (data) => {
      dispatch({ type: 'CLARIFICATIONS_REQUIRED', payload: data });
    });

    socket.on('clarificationsSubmitted', () => {
      dispatch({ type: 'CLARIFICATIONS_SUBMITTED' });
    });

    // Progress events
    socket.on('roundStart', (data) => {
      dispatch({ type: 'ROUND_START', payload: data });
    });

    socket.on('phaseStart', (data) => {
      dispatch({ type: 'PHASE_START', payload: data });
    });

    socket.on('agentStart', (data) => {
      dispatch({ type: 'AGENT_START', payload: data });
    });

    socket.on('agentComplete', (data) => {
      dispatch({ type: 'AGENT_COMPLETE', payload: data });
    });

    socket.on('phaseComplete', (data) => {
      dispatch({ type: 'PHASE_COMPLETE', payload: data });
    });

    socket.on('synthesisStart', () => {
      dispatch({ type: 'SYNTHESIS_START' });
    });

    socket.on('synthesisComplete', () => {
      dispatch({ type: 'SYNTHESIS_COMPLETE' });
    });

    socket.on('debateComplete', (data) => {
      dispatch({ type: 'DEBATE_COMPLETE', payload: data });
    });

    // Error events
    socket.on('error', (data) => {
      dispatch({ type: 'ERROR', payload: data });
    });

    socket.on('warning', (data) => {
      dispatch({ type: 'WARNING', payload: data });
    });

    socket.on('debateCancelled', () => {
      dispatch({ type: 'DEBATE_CANCELLED' });
    });

    return () => {
      disconnectSocket();
    };
  }, []);

  const setProblem = useCallback((problem: string) => {
    dispatch({ type: 'SET_PROBLEM', payload: problem });
  }, []);

  const toggleClarifications = useCallback(() => {
    dispatch({ type: 'TOGGLE_CLARIFICATIONS' });
  }, []);

  const startDebate = useCallback((problem: string) => {
    if (!problem.trim()) return;
    dispatch({ type: 'SET_PROBLEM', payload: problem });
    socketRef.current?.emit('startDebate', {
      problem: problem.trim(),
      clarificationsEnabled: state.clarificationsEnabled,
    });
  }, [state.clarificationsEnabled]);

  const submitClarifications = useCallback((answers: Record<string, string>) => {
    socketRef.current?.emit('submitClarifications', { answers });
  }, []);

  const cancelDebate = useCallback(() => {
    socketRef.current?.emit('cancelDebate');
  }, []);

  const clearNotification = useCallback((id: string) => {
    dispatch({ type: 'CLEAR_NOTIFICATION', payload: id });
  }, []);

  return {
    state,
    setProblem,
    toggleClarifications,
    startDebate,
    submitClarifications,
    cancelDebate,
    clearNotification,
  };
}

