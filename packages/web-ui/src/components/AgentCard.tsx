'use client'

import { useState } from 'react';
import { AgentState, ContributionType } from '@/lib/types';

interface AgentCardProps {
  agent: AgentState;
}

const roleColors: Record<string, string> = {
  architect: 'text-accent-blue',
  performance: 'text-accent-yellow',
  security: 'text-accent-red',
  testing: 'text-accent-green',
  kiss: 'text-accent-magenta',
  generalist: 'text-accent-cyan',
};

const contributionTypeLabels: Record<ContributionType, string> = {
  proposal: 'Proposal',
  critique: 'Critique',
  refinement: 'Refinement',
};

export default function AgentCard({ agent }: AgentCardProps) {
  const [expandedContribution, setExpandedContribution] = useState<number | null>(null);
  const roleColor = roleColors[agent.role] || 'text-text-primary';

  return (
    <div className="panel flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="panel-header flex items-center justify-between shrink-0">
        <span className={roleColor}>{agent.name}</span>
        <span className="text-text-muted text-xs">({agent.role})</span>
      </div>

      {/* Status */}
      <div className="px-3 py-2 border-b border-border/50 shrink-0">
        {agent.currentActivity ? (
          <div className="flex items-center gap-2">
            <span className="text-accent-yellow text-sm">⏳</span>
            <span className="text-text-secondary text-sm">
              {agent.currentActivity}
              <span className="typing-dots" />
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-accent-green text-sm">●</span>
            <span className="text-text-muted text-sm">idle</span>
          </div>
        )}
      </div>

      {/* Contributions */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {agent.contributions.length === 0 ? (
          <div className="text-text-muted text-xs text-center py-2">
            No contributions yet
          </div>
        ) : (
          <div className="space-y-1">
            {agent.contributions.map((contrib, idx) => {
              const isExpanded = expandedContribution === idx;
              return (
                <div
                  key={idx}
                  className="border-t border-border/30 first:border-t-0 py-1"
                >
                  <button
                    onClick={() => setExpandedContribution(isExpanded ? null : idx)}
                    className="flex items-center gap-2 w-full text-left hover:bg-tertiary/50 px-1 py-0.5 rounded"
                  >
                    <span className="text-accent-blue text-xs">
                      {contributionTypeLabels[contrib.type]}
                    </span>
                    <span className="text-text-muted text-xs">(R{contrib.round})</span>
                    <span className="text-text-muted text-xs ml-auto">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>
                  {isExpanded && (
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap mt-1 px-1 py-2 bg-tertiary/30 rounded max-h-40 overflow-y-auto">
                      {contrib.content}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

