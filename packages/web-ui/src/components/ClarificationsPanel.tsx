'use client'

import { useState } from 'react';
import { AgentClarifications } from '@/lib/types';

interface ClarificationsPanelProps {
  questions: AgentClarifications[];
  onSubmit: (answers: Record<string, string>) => void;
}

/**
 * Creates a composite key from agent ID and item ID to ensure uniqueness
 * across multiple agent groups.
 */
function getCompositeKey(agentId: string, itemId: string): string {
  return `${agentId}-${itemId}`;
}

export default function ClarificationsPanel({ questions, onSubmit }: ClarificationsPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    // Transform composite keys (agentId-itemId) back to simple itemId format
    // that the backend expects
    const transformedAnswers: Record<string, string> = {};
    questions.forEach(group => {
      group.items.forEach(item => {
        const compositeKey = getCompositeKey(group.agentId, item.id);
        if (answers[compositeKey] !== undefined) {
          transformedAnswers[item.id] = answers[compositeKey];
        }
      });
    });
    onSubmit(transformedAnswers);
  };

  const hasQuestions = questions.some(group => group.items.length > 0);

  if (!hasQuestions) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="text-accent-cyan">Clarifying Questions</span>
        </div>
        <div className="panel-content text-text-muted text-sm">
          No clarifying questions from agents.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="text-accent-cyan">Clarifying Questions</span>
      </div>
      <div className="panel-content space-y-4 max-h-64 overflow-y-auto">
        {questions.map((group) => {
          if (group.items.length === 0) return null;
          return (
            <div key={group.agentId} className="space-y-2">
              <div className="text-accent-blue text-sm font-medium">
                [{group.agentName}] <span className="text-text-muted">({group.role})</span>
              </div>
              {group.items.map((item) => {
                const compositeKey = getCompositeKey(group.agentId, item.id);
                return (
                  <div key={compositeKey} className="ml-2 space-y-1">
                    <div className="text-text-secondary text-sm">{item.question}</div>
                    <input
                      type="text"
                      value={answers[compositeKey] || ''}
                      onChange={(e) =>
                        setAnswers({ ...answers, [compositeKey]: e.target.value })
                      }
                      placeholder="Your answer (or leave empty to skip)"
                      className="w-full bg-tertiary border border-border rounded px-2 py-1 text-sm
                        placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        <button
          onClick={handleSubmit}
          className="w-full py-2 px-4 rounded font-medium bg-accent-cyan text-primary hover:bg-accent-cyan/80 transition-colors"
        >
          Submit Answers
        </button>
      </div>
    </div>
  );
}

