import { architectPrompts } from './architect-prompts';
import { performancePrompts } from './performance-prompts';
import { securityPrompts } from './security-prompts';
import { testingPrompts } from './testing-prompts';
import { generalistPrompts } from './generalist-prompts';
import { kissPrompts } from './kiss-prompts';
import { RolePrompts } from './prompt-types';
import { AGENT_ROLES, AgentRole } from '../../types/agent.types';

/**
 * Internal registry mapping agent roles to their corresponding prompt configurations.
 * 
 * This centralized registry allows for easy lookup of role-specific prompts
 * without needing separate agent classes for each role.
 * 
 */
const ROLE_PROMPTS_REGISTRY: Partial<Record<AgentRole, RolePrompts>> = {
  [AGENT_ROLES.ARCHITECT]: architectPrompts,
  [AGENT_ROLES.PERFORMANCE]: performancePrompts,
  [AGENT_ROLES.SECURITY]: securityPrompts,
  [AGENT_ROLES.TESTING]: testingPrompts,
  [AGENT_ROLES.GENERALIST]: generalistPrompts,
  [AGENT_ROLES.KISS]: kissPrompts,
};

/**
 * Retrieves the prompt configuration for a given agent role.
 * 
 * If the role is not found in the registry, defaults to architect prompts
 * to maintain backward compatibility and ensure system stability.
 * 
 * @param role - The agent role to get prompts for.
 * @returns The RolePrompts configuration for the specified role.
 */
export function getPromptsForRole(role: AgentRole): RolePrompts {
  return ROLE_PROMPTS_REGISTRY[role] ?? architectPrompts;
}

// Re-export types for convenience
export type { RolePrompts } from './prompt-types';

