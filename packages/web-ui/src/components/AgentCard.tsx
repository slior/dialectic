'use client'

import { useState, useEffect, useRef } from 'react';
import { AgentState, ContributionType } from '@/lib/types';

const COPY_FEEDBACK_TIMEOUT_MS = 2000;

interface AgentCardProps {
  agent: AgentState;
  isDebateCompleted: boolean;
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

/**
 * Formats agent contributions into a text string suitable for clipboard copying.
 * Includes agent header (name, ID, role) and all contributions with their types and rounds.
 */
function formatAgentContributions(agent: AgentState): string {
  // Format header
  let text = `Agent: ${agent.name}\nID: ${agent.id}\nRole: ${agent.role}\n\n`;

  // Format contributions
  agent.contributions.forEach((contrib) => {
    text += `--- ${contributionTypeLabels[contrib.type]} (Round ${contrib.round}) ---\n${contrib.content}\n\n`;
  });

  return text;
}

export default function AgentCard({ agent, isDebateCompleted }: AgentCardProps) {
  const [expandedContribution, setExpandedContribution] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const roleColor = roleColors[agent.role] || 'text-text-primary';

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (agent.contributions.length === 0) {
      return;
    }

    try {
      const text = formatAgentContributions(agent);
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Reset feedback after timeout
      timeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
        timeoutRef.current = null;
      }, COPY_FEEDBACK_TIMEOUT_MS);
    } catch (err) {
      // Silently handle clipboard errors (e.g., clipboard API not available)
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="panel flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="panel-header flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className={roleColor}>{agent.name}</span>
          <span className="text-text-muted text-xs">({agent.role})</span>
        </div>
        {/* Copy button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          disabled={!isDebateCompleted || agent.contributions.length === 0}
          title="Copy agent contributions to clipboard"
          className={`p-1.5 rounded transition-colors ${
            isDebateCompleted && agent.contributions.length > 0
              ? 'hover:bg-tertiary/30 text-text-primary'
              : 'opacity-50 cursor-not-allowed text-text-muted'
          }`}
        >
          {copySuccess ? (
            <span className="text-accent-green text-sm">✓</span>
          ) : (
            <span className="text-sm">📋</span>
          )}
        </button>
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

