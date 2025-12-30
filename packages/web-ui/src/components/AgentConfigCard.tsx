'use client'

import { AgentConfigInput } from '@/lib/types';

interface AgentConfigCardProps {
  agent: AgentConfigInput;
  index: number;
  allAgents: AgentConfigInput[];
  onChange: (agent: AgentConfigInput) => void;
  onRemove: () => void;
  disabled: boolean;
  canRemove: boolean;
}

const AGENT_ROLES = [
  { value: 'architect', label: 'Architect' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'testing', label: 'Testing' },
  { value: 'kiss', label: 'KISS' },
  { value: 'generalist', label: 'Generalist' },
  { value: 'datamodeling', label: 'Data Modeling' },
] as const;

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
] as const;

export default function AgentConfigCard({
  agent,
  index,
  allAgents,
  onChange,
  onRemove,
  disabled,
  canRemove,
}: AgentConfigCardProps) {
  const validateId = (id: string): string | undefined => {
    if (!id.trim()) {
      return 'ID is required';
    }
    const duplicate = allAgents.find((a, i) => i !== index && a.id === id.trim());
    if (duplicate) {
      return 'ID must be unique';
    }
    return undefined;
  };

  const validateName = (name: string): string | undefined => {
    if (!name.trim()) {
      return 'Name is required';
    }
    const duplicate = allAgents.find((a, i) => i !== index && a.name === name.trim());
    if (duplicate) {
      return 'Name must be unique';
    }
    return undefined;
  };

  const validateTemperature = (temp: number): string | undefined => {
    if (isNaN(temp) || temp < 0.0 || temp > 1.0) {
      return 'Temperature must be between 0.0 and 1.0';
    }
    return undefined;
  };

  const idError = validateId(agent.id);
  const nameError = validateName(agent.name);
  const tempError = validateTemperature(agent.temperature);
  const roleError = !agent.role ? 'Role is required' : undefined;
  const modelError = !agent.model.trim() ? 'Model is required' : undefined;
  const providerError = !agent.provider ? 'Provider is required' : undefined;

  const hasErrors = !!(idError || nameError || roleError || modelError || providerError || tempError);

  return (
    <div className="bg-tertiary border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Agent {index + 1}</h3>
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={disabled}
            className="text-sm text-accent-red hover:text-accent-red/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remove
          </button>
        )}
      </div>

      {/* ID */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">ID</label>
        <input
          type="text"
          value={agent.id}
          onChange={(e) => onChange({ ...agent, id: e.target.value })}
          disabled={disabled}
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${idError ? 'border-accent-red' : 'border-border'}`}
        />
        {idError && <p className="text-xs text-accent-red mt-1">{idError}</p>}
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Name</label>
        <input
          type="text"
          value={agent.name}
          onChange={(e) => onChange({ ...agent, name: e.target.value })}
          disabled={disabled}
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${nameError ? 'border-accent-red' : 'border-border'}`}
        />
        {nameError && <p className="text-xs text-accent-red mt-1">{nameError}</p>}
      </div>

      {/* Role */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Role</label>
        <select
          value={agent.role}
          onChange={(e) => onChange({ ...agent, role: e.target.value })}
          disabled={disabled}
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${roleError ? 'border-accent-red' : 'border-border'}`}
        >
          <option value="">Select role</option>
          {AGENT_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        {roleError && <p className="text-xs text-accent-red mt-1">{roleError}</p>}
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Model</label>
        <input
          type="text"
          value={agent.model}
          onChange={(e) => onChange({ ...agent, model: e.target.value })}
          disabled={disabled}
          placeholder="e.g., gpt-4, google/gemini-2.5-flash-lite"
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${modelError ? 'border-accent-red' : 'border-border'}`}
        />
        {modelError && <p className="text-xs text-accent-red mt-1">{modelError}</p>}
      </div>

      {/* Provider */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Provider</label>
        <select
          value={agent.provider}
          onChange={(e) => onChange({ ...agent, provider: e.target.value })}
          disabled={disabled}
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${providerError ? 'border-accent-red' : 'border-border'}`}
        >
          <option value="">Select provider</option>
          {PROVIDERS.map((provider) => (
            <option key={provider.value} value={provider.value}>
              {provider.label}
            </option>
          ))}
        </select>
        {providerError && <p className="text-xs text-accent-red mt-1">{providerError}</p>}
      </div>

      {/* Temperature */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Temperature (0.0 - 1.0)</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={agent.temperature}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) {
              onChange({ ...agent, temperature: value });
            }
          }}
          disabled={disabled}
          className={`w-full px-2 py-1 bg-secondary border rounded text-sm text-text-primary
            focus:border-accent-cyan focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${tempError ? 'border-accent-red' : 'border-border'}`}
        />
        {tempError && <p className="text-xs text-accent-red mt-1">{tempError}</p>}
      </div>
    </div>
  );
}

