import { AgentConfig } from './agent.types';
import { DebateConfig } from './debate.types';

export interface SystemConfig {
  agents: AgentConfig[];
  judge?: AgentConfig;
  debate?: DebateConfig;
}
