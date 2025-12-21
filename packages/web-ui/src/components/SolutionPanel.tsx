'use client'

import { useState } from 'react';
import { Solution } from '@/lib/types';

interface SolutionPanelProps {
  solution?: Solution;
}

export default function SolutionPanel({ solution }: SolutionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-secondary">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between border-b border-border hover:bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-accent-green">✦</span>
          <span className="text-accent-green font-medium">Synthesized Solution</span>
        </div>
        <span className="text-text-muted text-sm">
          {isExpanded ? '▼' : '▲'}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 max-h-64 overflow-y-auto">
          {solution ? (
            <div className="space-y-2">
              <pre className="text-text-primary text-sm whitespace-pre-wrap leading-relaxed">
                {solution.description}
              </pre>
              {solution.synthesizedBy && (
                <div className="text-text-muted text-xs pt-2 border-t border-border/50">
                  Synthesized by: {solution.synthesizedBy}
                </div>
              )}
            </div>
          ) : (
            <div className="text-text-muted text-sm text-center py-4">
              Solution will appear here after debate completion
            </div>
          )}
        </div>
      )}
    </div>
  );
}

