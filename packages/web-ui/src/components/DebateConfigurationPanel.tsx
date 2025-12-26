'use client'

import { AgentConfigInput } from '@/lib/types';
import AgentConfigCard from './AgentConfigCard';

interface DebateConfigurationPanelProps {
  rounds: number;
  agents: AgentConfigInput[];
  onRoundsChange: (rounds: number) => void;
  onAgentsChange: (agents: AgentConfigInput[]) => void;
  disabled: boolean;
  isCollapsed: boolean;
}

const MAX_AGENTS = 8;
const MIN_AGENTS = 1;

export default function DebateConfigurationPanel({
  rounds,
  agents,
  onRoundsChange,
  onAgentsChange,
  disabled,
  isCollapsed,
}: DebateConfigurationPanelProps) {
  const handleAddAgent = () => {
    if (agents.length >= MAX_AGENTS) return;
    
    const newAgent: AgentConfigInput = {
      id: `agent-${Date.now()}`,
      name: `Agent ${agents.length + 1}`,
      role: '',
      model: '',
      provider: '',
      temperature: 0.5,
    };
    
    onAgentsChange([...agents, newAgent]);
  };

  const handleRemoveAgent = (index: number) => {
    if (agents.length <= MIN_AGENTS) return;
    onAgentsChange(agents.filter((_, i) => i !== index));
  };

  const handleUpdateAgent = (index: number, agent: AgentConfigInput) => {
    const updated = [...agents];
    updated[index] = agent;
    onAgentsChange(updated);
  };

  const validateAgents = (): boolean => {
    if (agents.length === 0) return false;
    
    return agents.every((agent, index) => {
      const idError = !agent.id.trim() || agents.some((a, i) => i !== index && a.id === agent.id);
      const nameError = !agent.name.trim() || agents.some((a, i) => i !== index && a.name === agent.name);
      const roleError = !agent.role;
      const modelError = !agent.model.trim();
      const providerError = !agent.provider;
      const tempError = isNaN(agent.temperature) || agent.temperature < 0.0 || agent.temperature > 1.0;
      
      return !(idError || nameError || roleError || modelError || providerError || tempError);
    });
  };

  const isValid = validateAgents();
  const canAdd = agents.length < MAX_AGENTS && !disabled;
  const canRemove = agents.length > MIN_AGENTS && !disabled;

  return (
    <div className={`border-b border-border transition-all duration-300 ${isCollapsed ? 'max-h-0 overflow-hidden' : 'max-h-none'}`}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Debate Configuration</h2>
        </div>

        {/* Rounds Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-text-secondary">Number of Rounds</label>
          <input
            type="number"
            min="1"
            value={rounds}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value) && value >= 1) {
                onRoundsChange(value);
              }
            }}
            disabled={disabled}
            className="w-20 px-2 py-1 bg-tertiary border border-border rounded text-sm text-text-primary
              focus:border-accent-cyan focus:outline-none
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Agents Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-text-secondary">Agents ({agents.length})</label>
            <button
              onClick={handleAddAgent}
              disabled={!canAdd}
              className="text-sm text-accent-cyan hover:text-accent-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Agent
            </button>
          </div>

          {disabled && (
            <div className="text-xs text-text-muted bg-tertiary p-2 rounded">
              Configuration locked during debate
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {agents.map((agent, index) => (
              <AgentConfigCard
                key={index}
                agent={agent}
                index={index}
                allAgents={agents}
                onChange={(updatedAgent) => handleUpdateAgent(index, updatedAgent)}
                onRemove={() => handleRemoveAgent(index)}
                disabled={disabled}
                canRemove={canRemove}
              />
            ))}
          </div>

          {agents.length === 0 && (
            <div className="text-sm text-text-muted text-center py-4">
              No agents configured. Add at least one agent to start a debate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

