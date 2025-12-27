'use client'

import { ContributionType, DEBATE_STATUS, CONNECTION_STATUS, ConnectionStatus } from '@/lib/types';

interface StatusBarProps {
  status: string;
  round: number;
  totalRounds: number;
  phase?: ContributionType;
  connectionStatus: ConnectionStatus;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  [DEBATE_STATUS.IDLE]: { label: 'Ready', color: 'text-text-muted' },
  [DEBATE_STATUS.COLLECTING_CLARIFICATIONS]: { label: 'Collecting Questions', color: 'text-accent-cyan' },
  [DEBATE_STATUS.AWAITING_CLARIFICATIONS]: { label: 'Awaiting Answers', color: 'text-accent-yellow' },
  [DEBATE_STATUS.RUNNING]: { label: 'Running', color: 'text-accent-green' },
  [DEBATE_STATUS.COMPLETED]: { label: 'Completed', color: 'text-accent-blue' },
  [DEBATE_STATUS.ERROR]: { label: 'Error', color: 'text-accent-red' },
};

const phaseLabels: Record<ContributionType, string> = {
  proposal: 'Proposals',
  critique: 'Critiques',
  refinement: 'Refinements',
};

const connectionLabels: Record<ConnectionStatus, { label: string; color: string }> = {
  [CONNECTION_STATUS.CONNECTING]: { label: 'Connecting', color: 'text-accent-yellow' },
  [CONNECTION_STATUS.CONNECTED]: { label: '', color: '' }, // Use debate status when connected
  [CONNECTION_STATUS.DISCONNECTED]: { label: 'Disconnected', color: 'text-accent-red' },
};

export default function StatusBar({ status, round, totalRounds, phase, connectionStatus }: StatusBarProps) {
  const statusInfo = statusLabels[status] || { label: status, color: 'text-text-primary' };
  
  // Determine what to show on the right side
  const showConnectionStatus = connectionStatus === CONNECTION_STATUS.CONNECTING || connectionStatus === CONNECTION_STATUS.DISCONNECTED;
  const displayInfo = showConnectionStatus 
    ? connectionLabels[connectionStatus]
    : statusInfo;

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
        {status === DEBATE_STATUS.RUNNING && (
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
          connectionStatus === CONNECTION_STATUS.CONNECTING ? 'bg-accent-yellow animate-pulse-dot' :
          connectionStatus === CONNECTION_STATUS.DISCONNECTED ? 'bg-accent-red' :
          status === DEBATE_STATUS.RUNNING ? 'bg-accent-green animate-pulse-dot' : 
          status === DEBATE_STATUS.ERROR ? 'bg-accent-red' : 'bg-text-muted'
        }`} />
        <span className={`text-sm ${displayInfo.color}`}>
          {displayInfo.label}
        </span>
      </div>
    </div>
  );
}

