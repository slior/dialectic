import fs from 'fs';
import os from 'os';
import path from 'path';

import { 
  EXIT_INVALID_ARGS, 
  DebateState, 
  DEBATE_STATUS, 
  loadEnvironmentFile,
  AGENT_ROLES,
  CONTRIBUTION_TYPES,
  SystemConfig,
  LLM_PROVIDERS,
  DebateRound
} from 'dialectic-core';

import { runCli } from '../index';


// Mock env-loader
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn()
  };
});

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;

// Test file name constants
const DEFAULT_CONFIG_FILE = 'debate-config.json';
const DEFAULT_DEBATE_FILE = 'debate.json';
const DEFAULT_REPORT_FILE = 'report.md';
const TEST_AGENT_ID_ARCHITECT = 'agent-architect';
const TEST_AGENT_ID_PERFORMANCE = 'agent-performance';
const TEST_JUDGE_ID = 'judge-main';
const TEST_DEBATE_ID = 'deb-test-123';
const TEST_PROBLEM_DESCRIPTION = 'Test problem description';
const TEST_PROPOSAL_CONTENT = 'Test proposal content';
const TEST_SOLUTION_DESCRIPTION = 'Test solution';
const NOT_AVAILABLE = 'N/A';

// Report section markers (for test assertions)
const REPORT_HEADER = '# Debate:';
const SECTION_PROBLEM = '## Problem Description';
const SECTION_AGENTS = '## Agents';
const SECTION_JUDGE = '## Judge';
const SECTION_ROUNDS = '## Rounds';
const SECTION_CLARIFICATIONS = '## Clarifications';

describe('CLI report command', () => {
  const originalEnv = process.env;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
      throw new Error(`process.exit: ${code}`);
    });
    mockedLoadEnvironmentFile.mockClear();
    
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Creates a minimal valid debate state for testing.
   * 
   * @returns A minimal DebateState with required fields populated.
   */
  function createMinimalDebateState(): DebateState {
    return {
      id: TEST_DEBATE_ID,
      problem: TEST_PROBLEM_DESCRIPTION,
      status: DEBATE_STATUS.COMPLETED,
      currentRound: 1,
      rounds: [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: TEST_AGENT_ID_ARCHITECT,
              agentRole: AGENT_ROLES.ARCHITECT,
              type: CONTRIBUTION_TYPES.PROPOSAL,
              content: TEST_PROPOSAL_CONTENT,
              metadata: {}
            }
          ],
          timestamp: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      finalSolution: {
        description: TEST_SOLUTION_DESCRIPTION,
        tradeoffs: [],
        recommendations: [],
        confidence: 80,
        synthesizedBy: TEST_JUDGE_ID
      }
    };
  }

  /**
   * Creates a minimal valid config file for testing.
   * 
   * @returns A minimal SystemConfig with required fields populated.
   */
  function createMinimalConfig(): SystemConfig {
    return {
      agents: [
        {
          id: TEST_AGENT_ID_ARCHITECT,
          name: 'System Architect',
          role: AGENT_ROLES.ARCHITECT,
          model: 'gpt-4',
          provider: LLM_PROVIDERS.OPENAI,
          temperature: 0.5
        }
      ],
      judge: {
        id: TEST_JUDGE_ID,
        name: 'Technical Judge',
        role: AGENT_ROLES.GENERALIST,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: 0.3
      }
    };
  }

  /**
   * Extracts the stdout content from the stdout spy.
   * 
   * @returns The concatenated stdout content as a string.
   */
  function getStdoutContent(): string {
    const stdoutCalls = (stdoutSpy as jest.Mock).mock.calls;
    return stdoutCalls.map((call: unknown[]) => call[0] as string).join('');
  }

  /**
   * Writes a debate state to a file path.
   * 
   * @param filePath - The path where the debate state should be written.
   * @param debateState - The debate state to write.
   */
  function writeDebateStateToFile(filePath: string, debateState: DebateState): void {
    fs.writeFileSync(filePath, JSON.stringify(debateState));
  }

  /**
   * Handles backup and restoration of the default config file.
   * Temporarily removes the config file if it exists, then restores it in the finally block.
   * 
   * @param testFn - The test function to run while the config file is removed.
   */
  async function withConfigFileRemoved(testFn: () => Promise<void>): Promise<void> {
    const defaultConfigPath = path.join(process.cwd(), DEFAULT_CONFIG_FILE);
    const configExists = fs.existsSync(defaultConfigPath);
    let configBackup: string | undefined;
    
    if (configExists) {
      configBackup = fs.readFileSync(defaultConfigPath, 'utf-8');
      fs.unlinkSync(defaultConfigPath);
    }

    try {
      await testFn();
    } finally {
      if (configExists && configBackup) {
        fs.writeFileSync(defaultConfigPath, configBackup, 'utf-8');
      }
    }
  }

  /**
   * Asserts that stdout content contains the expected report sections.
   * 
   * @param content - The stdout content to check.
   */
  function assertReportSections(content: string): void {
    expect(content).toContain(REPORT_HEADER);
    expect(content).toContain(TEST_PROBLEM_DESCRIPTION);
    expect(content).toContain(SECTION_PROBLEM);
    expect(content).toContain(SECTION_AGENTS);
    expect(content).toContain(SECTION_JUDGE);
    expect(content).toContain(SECTION_ROUNDS);
  }

  describe('Required flag validation', () => {
    it('should reject when --debate flag is missing', async () => {
      await expect(runCli(['report']))
        .rejects.toThrow();
    });
  });

  describe('File existence validation', () => {
    it('should exit with invalid args when debate file does not exist', async () => {
      await expect(runCli(['report', '--debate', 'nonexistent.json']))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate path is a directory', async () => {
      const dirPath = path.join(tmpDir, 'dir');
      fs.mkdirSync(dirPath, { recursive: true });

      await expect(runCli(['report', '--debate', dirPath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('JSON format validation', () => {
    it('should exit with invalid args when debate file contains invalid JSON', async () => {
      const debatePath = path.join(tmpDir, 'invalid.json');
      fs.writeFileSync(debatePath, 'not valid json {');

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON is missing required fields', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      fs.writeFileSync(debatePath, JSON.stringify({ id: 'test' })); // Missing problem, status, rounds

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid id field', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const invalidState = createMinimalDebateState();
      invalidState.id = undefined as unknown as string;
      writeDebateStateToFile(debatePath, invalidState);

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid problem field', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const invalidState = createMinimalDebateState();
      invalidState.problem = undefined as unknown as string;
      writeDebateStateToFile(debatePath, invalidState);

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid rounds field', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const invalidState = createMinimalDebateState();
      invalidState.rounds = undefined as unknown as DebateRound[];
      writeDebateStateToFile(debatePath, invalidState);

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Report generation', () => {
    it('should generate report without config file when --config not provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      await withConfigFileRemoved(async () => {
        await runCli(['report', '--debate', debatePath]);
        
        // Should write to stdout
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutContent = getStdoutContent();
        
        // Should contain report content
        assertReportSections(stdoutContent);
        
        // Should contain minimal configs (agent ID as name, N/A for model/provider)
        expect(stdoutContent).toContain(TEST_AGENT_ID_ARCHITECT);
        expect(stdoutContent).toContain(NOT_AVAILABLE);
      });
    });

    it('should generate report with config file when --config provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const configPath = path.join(tmpDir, 'custom-config.json');
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      await runCli(['report', '--debate', debatePath, '--config', configPath]);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain report content
      assertReportSections(stdoutContent);
      
      // Should contain config values (not N/A)
      expect(stdoutContent).toContain('System Architect');
      expect(stdoutContent).toContain('gpt-4');
    });

    it('should generate report and write to stdout when no output path provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath]);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain report content
      assertReportSections(stdoutContent);
    });

    it('should generate report and write to file when output path provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const outputPath = path.join(tmpDir, DEFAULT_REPORT_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath, '--output', outputPath]);
      
      // Should create output file
      expect(fs.existsSync(outputPath)).toBe(true);
      
      // Should contain report content
      const reportContent = fs.readFileSync(outputPath, 'utf-8');
      assertReportSections(reportContent);
    });

    it('should create parent directories when output path is provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const outputPath = path.join(tmpDir, 'nested', 'dir', DEFAULT_REPORT_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath, '--output', outputPath]);
      
      // Should create nested directories and file
      expect(fs.existsSync(outputPath)).toBe(true);
      
      // Should contain report content
      const reportContent = fs.readFileSync(outputPath, 'utf-8');
      expect(reportContent).toContain(REPORT_HEADER);
    });

    it('should overwrite existing file when output path exists', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const outputPath = path.join(tmpDir, DEFAULT_REPORT_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Create existing output file
      fs.writeFileSync(outputPath, 'old content');

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath, '--output', outputPath]);
      
      // Should overwrite with new content
      const reportContent = fs.readFileSync(outputPath, 'utf-8');
      expect(reportContent).not.toContain('old content');
      expect(reportContent).toContain(REPORT_HEADER);
    });

    it('should use custom config file when --config provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const configPath = path.join(tmpDir, 'custom-config.json');
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      await runCli(['report', '--debate', debatePath, '--config', configPath]);
      
      // Should succeed and write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should include verbose metadata when --verbose flag is provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Add metadata to contribution
      if (debateState.rounds[0] && debateState.rounds[0].contributions[0]) {
        debateState.rounds[0].contributions[0].metadata = {
          latencyMs: 1234,
          tokensUsed: 567,
          model: 'gpt-4'
        };
      }
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath, '--verbose']);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain verbose metadata
      expect(stdoutContent).toContain('latency=');
      expect(stdoutContent).toContain('tokens=');
    });

    it('should match agent configs by ID from debate state when --config provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const configPath = path.join(tmpDir, 'custom-config.json');
      const debateState = createMinimalDebateState();
      // Add another agent to debate
      if (debateState.rounds[0]) {
        debateState.rounds[0].contributions.push({
          agentId: TEST_AGENT_ID_PERFORMANCE,
          agentRole: AGENT_ROLES.PERFORMANCE,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Performance proposal',
          metadata: {}
        });
      }
      writeDebateStateToFile(debatePath, debateState);

      // Create config with multiple agents
      const config = createMinimalConfig();
      config.agents.push({
        id: TEST_AGENT_ID_PERFORMANCE,
        name: 'Performance Engineer',
        role: AGENT_ROLES.PERFORMANCE,
        model: 'gpt-4',
        provider: LLM_PROVIDERS.OPENAI,
        temperature: 0.6
      });
      fs.writeFileSync(configPath, JSON.stringify(config));

      await runCli(['report', '--debate', debatePath, '--config', configPath]);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain both agents from config
      expect(stdoutContent).toContain('System Architect');
      expect(stdoutContent).toContain('Performance Engineer');
    });

    it('should create minimal configs from debate state when --config not provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Add another agent to debate
      if (debateState.rounds[0]) {
        debateState.rounds[0].contributions.push({
          agentId: TEST_AGENT_ID_PERFORMANCE,
          agentRole: AGENT_ROLES.PERFORMANCE,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Performance proposal',
          metadata: {}
        });
      }
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath]);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain both agents (as IDs since no config)
      expect(stdoutContent).toContain(TEST_AGENT_ID_ARCHITECT);
      expect(stdoutContent).toContain(TEST_AGENT_ID_PERFORMANCE);
      // Should contain N/A values for minimal configs
      expect(stdoutContent).toContain(NOT_AVAILABLE);
    });

    it('should handle clarifications in debate state', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      debateState.clarifications = [
        {
          agentId: TEST_AGENT_ID_ARCHITECT,
          agentName: 'System Architect',
          role: AGENT_ROLES.ARCHITECT,
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: '1000 users'
            }
          ]
        }
      ];
      writeDebateStateToFile(debatePath, debateState);

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath]);
      
      // Should write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      
      // Should contain clarifications section
      expect(stdoutContent).toContain(SECTION_CLARIFICATIONS);
      expect(stdoutContent).toContain('What is the expected scale?');
      expect(stdoutContent).toContain('1000 users');
    });

    it('should handle Date objects in debate state (revive from strings)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Serialize dates as strings (as they would be in JSON)
      const serializedState = JSON.parse(JSON.stringify(debateState));
      fs.writeFileSync(debatePath, JSON.stringify(serializedState));

      // Don't create config file - should work without it
      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (dates are revived)
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should work when --config provided and config is missing judge (uses defaults)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const configPath = path.join(tmpDir, 'config-no-judge.json');
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Create config without judge (loadConfig will add default judge)
      const config = {
        agents: createMinimalConfig().agents
        // No judge - loadConfig will add default
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      await runCli(['report', '--debate', debatePath, '--config', configPath]);
      
      // Should succeed (loadConfig adds default judge)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should work without config file when --config not provided', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      await withConfigFileRemoved(async () => {
        await runCli(['report', '--debate', debatePath]);
        
        // Should succeed without config (creates minimal configs from debate state)
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutContent = getStdoutContent();
        
        // Should contain report with minimal configs
        expect(stdoutContent).toContain(REPORT_HEADER);
        expect(stdoutContent).toContain(SECTION_AGENTS);
        expect(stdoutContent).toContain(TEST_AGENT_ID_ARCHITECT);
      });
    });
  });
});

