'use client'

import { ContributionType } from '@/lib/types';

interface StatusBarProps {
  status: string;
  round: number;
  totalRounds: number;
  phase?: ContributionType;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  idle: { label: 'Ready', color: 'text-text-muted' },
  collecting_clarifications: { label: 'Collecting Questions', color: 'text-accent-cyan' },
  awaiting_clarifications: { label: 'Awaiting Answers', color: 'text-accent-yellow' },
  running: { label: 'Running', color: 'text-accent-green' },
  completed: { label: 'Completed', color: 'text-accent-blue' },
  error: { label: 'Error', color: 'text-accent-red' },
};

const phaseLabels: Record<ContributionType, string> = {
  proposal: 'Proposals',
  critique: 'Critiques',
  refinement: 'Refinements',
};

export default function StatusBar({ status, round, totalRounds, phase }: StatusBarProps) {
  const statusInfo = statusLabels[status] || { label: status, color: 'text-text-primary' };

  return (
    <div className="bg-tertiary border-b border-border px-4 py-2 flex items-center justify-between">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <span className="text-accent-cyan font-semibold">DIALECTIC</span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary text-sm">Multi-Agent Debate System</span>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4">
        {status === 'running' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-sm">Round:</span>
              <span className="text-accent-blue font-medium">
                {round}/{totalRounds}
              </span>
            </div>
            {phase && (
              <>
                <span className="text-text-muted">•</span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm">Phase:</span>
                  <span className="text-accent-magenta font-medium">
                    {phaseLabels[phase]}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Right: Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          status === 'running' ? 'bg-accent-green animate-pulse-dot' : 
          status === 'error' ? 'bg-accent-red' : 'bg-text-muted'
        }`} />
        <span className={`text-sm ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>
    </div>
  );
}

