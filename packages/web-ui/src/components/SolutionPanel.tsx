'use client'

import { useState, useEffect, useRef } from 'react';
import { Solution } from '@/lib/types';
import { downloadDebate } from '@/lib/api';

const COPY_FEEDBACK_TIMEOUT_MS = 2000;

interface SolutionPanelProps {
  solution?: Solution;
  debateId?: string;
  userFeedback?: number;
  onFeedbackSubmit?: (feedback: number) => void;
}

export default function SolutionPanel({ solution, debateId, userFeedback, onFeedbackSubmit }: SolutionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!solution?.description) {
      return;
    }

    try {
      await navigator.clipboard.writeText(solution.description);
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

  const hasSolution = !!solution?.description;
  const canProvideFeedback = !!debateId && debateId.trim().length > 0;
  const isPositiveActive = userFeedback === 1;
  const isNegativeActive = userFeedback === -1;

  const handleFeedbackClick = (feedback: number) => {
    if (!canProvideFeedback || !onFeedbackSubmit) {
      return;
    }
    onFeedbackSubmit(feedback);
  };

  const handleDownload = async () => {
    if (!canProvideFeedback) {
      return;
    }
    try {
      await downloadDebate(debateId!);
    } catch (err) {
      console.error('Failed to download debate:', err);
      // Error handling could be improved with a notification system
    }
  };

  return (
    <div className="bg-secondary h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 w-full px-4 py-2 flex items-center justify-between border-b border-border">
        {/* Left: Title */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:bg-tertiary/30 transition-colors rounded px-2 py-1 -mx-2"
        >
          <span className="text-accent-green">✦</span>
          <span className="text-accent-green font-medium">Synthesized Solution</span>
        </button>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          {/* Thumb-up button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFeedbackClick(1);
            }}
            disabled={!canProvideFeedback}
            title="Positive feedback (thumb-up)"
            className={`p-1.5 rounded transition-colors ${
              canProvideFeedback
                ? isPositiveActive
                  ? 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
                  : 'hover:bg-tertiary/30 text-text-primary'
                : 'opacity-50 cursor-not-allowed text-text-muted'
            }`}
          >
            <span className="text-sm">👍</span>
          </button>

          {/* Thumb-down button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFeedbackClick(-1);
            }}
            disabled={!canProvideFeedback}
            title="Negative feedback (thumb-down)"
            className={`p-1.5 rounded transition-colors ${
              canProvideFeedback
                ? isNegativeActive
                  ? 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30'
                  : 'hover:bg-tertiary/30 text-text-primary'
                : 'opacity-50 cursor-not-allowed text-text-muted'
            }`}
          >
            <span className="text-sm">👎</span>
          </button>

          {/* Download button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            disabled={!canProvideFeedback}
            title="Download debate JSON file"
            className={`p-1.5 rounded transition-colors ${
              canProvideFeedback
                ? 'hover:bg-tertiary/30 text-text-primary'
                : 'opacity-50 cursor-not-allowed text-text-muted'
            }`}
          >
            <span className="text-sm">⬇️</span>
          </button>

          {/* Copy button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            disabled={!hasSolution}
            title="Copy solution to clipboard"
            className={`p-1.5 rounded transition-colors ${
              hasSolution
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

          {/* Expand/collapse indicator */}
          <span className="text-text-muted text-sm">
            {isExpanded ? '▼' : '▲'}
          </span>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 min-h-0 p-4 overflow-y-auto">
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

