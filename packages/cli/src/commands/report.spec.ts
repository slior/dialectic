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
  DebateRound,
  DebateStatus,
  AgentRole,
  generateDebateReport,
  writeFileWithDirectories
} from 'dialectic-core';

import { runCli } from '../index';

import { loadConfig } from './debate';

// Mock env-loader
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
    loadEnvironmentFile: jest.fn()
  };
});

// Mock loadConfig for testing defensive check
jest.mock('./debate', () => {
  const actual = jest.requireActual('./debate');
  return {
    ...actual,
    loadConfig: jest.fn()
  };
});

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;
const mockedLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;

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
    mockedLoadConfig.mockClear();
    // Reset loadConfig to use actual implementation by default
    mockedLoadConfig.mockImplementation(jest.requireActual('./debate').loadConfig);
    
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
    return Object.assign(new DebateState(), {
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
    });
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

    it('should exit with invalid args when debate JSON has invalid status field', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const invalidState = createMinimalDebateState();
      invalidState.status = undefined as unknown as DebateStatus;
      writeDebateStateToFile(debatePath, invalidState);

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has status field that is not a string', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const invalidState = createMinimalDebateState();
      invalidState.status = 123 as unknown as DebateStatus;
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

    it('should handle missing createdAt field in debate state (not revived when undefined)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Write JSON with createdAt as null (simulating missing/invalid field)
      // This tests that reviveDatesInDebateState handles undefined/null gracefully
      const serialized = JSON.parse(JSON.stringify(debateState));
      serialized.createdAt = null;
      fs.writeFileSync(debatePath, JSON.stringify(serialized));

      // This will fail in generateDebateReport since createdAt is required,
      // but we're testing that reviveDatesInDebateState doesn't crash on null/undefined
      // Note: In practice, createdAt should always be present, but we test the defensive code
      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toThrow();
    });

    it('should handle missing updatedAt field in debate state (not revived when undefined)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Write JSON with updatedAt as null (simulating missing/invalid field)
      // This tests that reviveDatesInDebateState handles undefined/null gracefully
      const serialized = JSON.parse(JSON.stringify(debateState));
      serialized.updatedAt = null;
      fs.writeFileSync(debatePath, JSON.stringify(serialized));

      // Should succeed (updatedAt is optional for generateDebateReport, only createdAt is required)
      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (missing updatedAt is handled - not revived since it's null/undefined)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle createdAt that is already a Date object', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      debateState.createdAt = new Date('2024-01-01');
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (Date objects are not revived)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle round timestamp that is already a Date object', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      if (debateState.rounds[0]) {
        debateState.rounds[0].timestamp = new Date('2024-01-01');
      }
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (Date objects are not revived)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle round without timestamp field', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      if (debateState.rounds[0]) {
        delete (debateState.rounds[0] as { timestamp?: Date }).timestamp;
      }
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (missing timestamp is handled)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle contributions without agentId or agentRole', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      if (debateState.rounds[0]) {
        debateState.rounds[0].contributions.push({
          agentId: undefined as unknown as string,
          agentRole: AGENT_ROLES.ARCHITECT,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Test',
          metadata: {}
        });
        debateState.rounds[0].contributions.push({
          agentId: TEST_AGENT_ID_ARCHITECT,
          agentRole: undefined as unknown as AgentRole,
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Test',
          metadata: {}
        });
      }
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (contributions without agentId/agentRole are skipped)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle duplicate agent IDs (first occurrence wins)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      // Add same agent ID with different role in another round
      debateState.rounds.push({
        roundNumber: 2,
        contributions: [
          {
            agentId: TEST_AGENT_ID_ARCHITECT,
            agentRole: AGENT_ROLES.PERFORMANCE, // Different role
            type: CONTRIBUTION_TYPES.PROPOSAL,
            content: 'Test',
            metadata: {}
          }
        ],
        timestamp: new Date()
      });
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (first occurrence wins, so architect role is used)
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      // Should only contain architect role (first occurrence)
      expect(stdoutContent).toContain(TEST_AGENT_ID_ARCHITECT);
    });

    it('should handle invalid agent role (defaults to architect)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      if (debateState.rounds[0]) {
        debateState.rounds[0].contributions.push({
          agentId: 'agent-invalid-role',
          agentRole: 'invalid-role' as typeof AGENT_ROLES[keyof typeof AGENT_ROLES],
          type: CONTRIBUTION_TYPES.PROPOSAL,
          content: 'Test',
          metadata: {}
        });
      }
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (invalid role defaults to architect)
      expect(stdoutSpy).toHaveBeenCalled();
      const stdoutContent = getStdoutContent();
      // Should contain the agent ID
      expect(stdoutContent).toContain('agent-invalid-role');
    });

    it('should handle empty rounds array', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      debateState.rounds = [];
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (empty rounds array is valid)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle judge ID from finalSolution.synthesizedBy', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      debateState.finalSolution = {
        description: TEST_SOLUTION_DESCRIPTION,
        tradeoffs: [],
        recommendations: [],
        confidence: 80,
        synthesizedBy: 'custom-judge-id'
      };
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (uses synthesizedBy as judge ID)
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should handle missing finalSolution (defaults to judge-main)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      delete (debateState as { finalSolution?: unknown }).finalSolution;
      writeDebateStateToFile(debatePath, debateState);

      await runCli(['report', '--debate', debatePath]);
      
      // Should succeed (defaults to judge-main)
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

    it('should handle error without code property', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Mock generateDebateReport to throw an error without code
      const originalGenerate = generateDebateReport;
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'generateDebateReport').mockImplementationOnce((..._args: unknown[]) => {
        throw new Error('Test error without code');
      });

      try {
        await expect(runCli(['report', '--debate', debatePath]))
          .rejects.toThrow();
        
        // Should write error to stderr
        expect(stderrSpy).toHaveBeenCalled();
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        jest.spyOn(require('dialectic-core'), 'generateDebateReport').mockImplementation(originalGenerate as (...args: unknown[]) => unknown);
      }
    });

    it('should handle error without message property', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Mock writeFileWithDirectories to throw an error without message
      const originalWrite = writeFileWithDirectories;
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'writeFileWithDirectories').mockImplementationOnce((..._args: unknown[]) => {
        const err = Object.create(Error.prototype) as Error & { code?: number };
        // Create error without message property
        Object.defineProperty(err, 'message', { value: undefined, writable: true });
        err.code = EXIT_INVALID_ARGS;
        throw err;
      });

      try {
        await expect(runCli(['report', '--debate', debatePath, '--output', path.join(tmpDir, 'output.md')]))
          .rejects.toThrow();
        
        // Should write error to stderr with "Unknown error"
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown error'));
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        jest.spyOn(require('dialectic-core'), 'writeFileWithDirectories').mockImplementation(originalWrite as (...args: unknown[]) => unknown);
      }
    });

    it('should handle error with code that is not a number', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Mock generateDebateReport to throw an error with non-number code
      const originalGenerate = generateDebateReport;
      // Using require() here is intentional: jest.spyOn() needs the module object, not the imported function
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      jest.spyOn(require('dialectic-core'), 'generateDebateReport').mockImplementationOnce((..._args: unknown[]) => {
        const err: Error & { code?: unknown } = new Error('Test error');
        err.code = 'not-a-number';
        throw err;
      });

      try {
        await expect(runCli(['report', '--debate', debatePath]))
          .rejects.toThrow();
        
        // Should use EXIT_GENERAL_ERROR when code is not a number
        expect(stderrSpy).toHaveBeenCalled();
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        jest.spyOn(require('dialectic-core'), 'generateDebateReport').mockImplementation(originalGenerate as (...args: unknown[]) => unknown);
      }
    });

    it('should handle missing judge in config (defensive check)', async () => {
      const debatePath = path.join(tmpDir, DEFAULT_DEBATE_FILE);
      const configPath = path.join(tmpDir, 'config-no-judge.json');
      const debateState = createMinimalDebateState();
      writeDebateStateToFile(debatePath, debateState);

      // Create config file
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      // Mock loadConfig to return config without judge (testing defensive check)
      mockedLoadConfig.mockResolvedValueOnce({
        agents: config.agents
        // Intentionally missing judge to test defensive check
      } as SystemConfig);

      await expect(runCli(['report', '--debate', debatePath, '--config', configPath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      
      // Should write error to stderr
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration missing judge definition'));
    });
  });
});

