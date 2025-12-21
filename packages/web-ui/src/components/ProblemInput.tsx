'use client'

interface ProblemInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

export default function ProblemInput({ value, onChange, disabled }: ProblemInputProps) {
  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <span className="text-accent-cyan">Problem Description</span>
        <span className="text-text-muted text-xs">{value.length} chars</span>
      </div>
      <div className="panel-content">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Describe the software design problem you want to debate...

For example:
• Design a rate limiting system for an API gateway
• Create an authentication flow for a microservices architecture
• Build a caching strategy for a high-traffic web application"
          className={`w-full h-48 bg-tertiary border border-border rounded px-3 py-2 text-sm resize-none
            placeholder:text-text-muted focus:border-accent-cyan focus:outline-none
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      </div>
    </div>
  );
}

