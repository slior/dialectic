'use client'

import { useDebateSocket } from '@/hooks/useDebateSocket';
import StatusBar from './StatusBar';
import NotificationArea from './NotificationArea';
import ProblemInput from './ProblemInput';
import ClarificationsPanel from './ClarificationsPanel';
import AgentCard from './AgentCard';
import SolutionPanel from './SolutionPanel';

export default function Dashboard() {
  const {
    state,
    setProblem,
    toggleClarifications,
    startDebate,
    submitClarifications,
    cancelDebate,
    clearNotification,
  } = useDebateSocket();

  const canStartDebate = !state.isRunning && state.problem.trim().length > 0;
  const showClarifications = state.status === 'awaiting_clarifications' && state.clarificationQuestions;

  return (
    <div className="h-screen flex flex-col bg-primary">
      {/* Top: Status Bar */}
      <StatusBar
        status={state.status}
        round={state.currentRound}
        totalRounds={state.totalRounds}
        phase={state.currentPhase}
      />

      {/* Notifications */}
      <NotificationArea
        notifications={state.notifications}
        onDismiss={clearNotification}
      />

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel: Problem Input + Clarifications + Controls */}
        <div className="w-1/3 border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ProblemInput
              value={state.problem}
              onChange={setProblem}
              disabled={state.isRunning}
            />

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.clarificationsEnabled}
                  onChange={toggleClarifications}
                  disabled={state.isRunning}
                  className="w-4 h-4 rounded border-border bg-tertiary checked:bg-accent-cyan"
                />
                Enable Clarifications
              </label>
            </div>

            {showClarifications && state.clarificationQuestions && (
              <ClarificationsPanel
                questions={state.clarificationQuestions}
                onSubmit={submitClarifications}
              />
            )}
          </div>

          {/* Control Buttons */}
          <div className="p-4 border-t border-border flex gap-3">
            <button
              onClick={() => startDebate(state.problem)}
              disabled={!canStartDebate}
              className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                canStartDebate
                  ? 'bg-accent-green text-primary hover:bg-accent-green/80'
                  : 'bg-tertiary text-text-muted cursor-not-allowed'
              }`}
            >
              {state.isRunning ? 'Debate in Progress...' : 'Start Debate'}
            </button>
            {state.isRunning && (
              <button
                onClick={cancelDebate}
                className="py-2 px-4 rounded font-medium bg-accent-red text-primary hover:bg-accent-red/80 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Right Panel: Agents Grid */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Agents Grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 h-full">
              {state.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
              {state.agents.length === 0 && (
                <div className="col-span-3 flex items-center justify-center text-text-muted">
                  <span>Connect to server to see agents</span>
                </div>
              )}
            </div>
          </div>

          {/* Solution Panel */}
          <div className="border-t border-border">
            <SolutionPanel solution={state.solution} />
          </div>
        </div>
      </div>
    </div>
  );
}

