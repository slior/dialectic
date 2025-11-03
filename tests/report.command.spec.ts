import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCli } from '../src/cli/index';
import { EXIT_INVALID_ARGS, EXIT_GENERAL_ERROR } from '../src/utils/exit-codes';
import { DebateState } from '../src/types/debate.types';
import { DEBATE_STATUS } from '../src/types/debate.types';

// Mock env-loader
jest.mock('../src/utils/env-loader', () => ({
  loadEnvironmentFile: jest.fn()
}));

import { loadEnvironmentFile } from '../src/utils/env-loader';

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;

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
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    }) as any);
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
    } catch {}
  });

  /**
   * Creates a minimal valid debate state for testing.
   */
  function createMinimalDebateState(): DebateState {
    return {
      id: 'deb-test-123',
      problem: 'Test problem description',
      status: DEBATE_STATUS.COMPLETED,
      currentRound: 1,
      rounds: [
        {
          roundNumber: 1,
          contributions: [
            {
              agentId: 'agent-architect',
              agentRole: 'architect',
              type: 'proposal',
              content: 'Test proposal content',
              metadata: {}
            }
          ],
          timestamp: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      finalSolution: {
        description: 'Test solution',
        tradeoffs: [],
        recommendations: [],
        confidence: 80,
        synthesizedBy: 'judge-main'
      }
    };
  }

  /**
   * Creates a minimal valid config file for testing.
   */
  function createMinimalConfig(): any {
    return {
      agents: [
        {
          id: 'agent-architect',
          name: 'System Architect',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5
        }
      ],
      judge: {
        id: 'judge-main',
        name: 'Technical Judge',
        role: 'generalist',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.3
      }
    };
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
      const debatePath = path.join(tmpDir, 'debate.json');
      fs.writeFileSync(debatePath, JSON.stringify({ id: 'test' })); // Missing problem, status, rounds

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid id field', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const invalidState = createMinimalDebateState();
      invalidState.id = undefined as any;
      fs.writeFileSync(debatePath, JSON.stringify(invalidState));

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid problem field', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const invalidState = createMinimalDebateState();
      invalidState.problem = undefined as any;
      fs.writeFileSync(debatePath, JSON.stringify(invalidState));

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });

    it('should exit with invalid args when debate JSON has invalid rounds field', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const invalidState = createMinimalDebateState();
      invalidState.rounds = undefined as any;
      fs.writeFileSync(debatePath, JSON.stringify(invalidState));

      await expect(runCli(['report', '--debate', debatePath]))
        .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
    });
  });

  describe('Report generation', () => {
    it('should generate report and write to stdout when no output path provided', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath]);
        
        // Should write to stdout
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutCalls = (stdoutSpy as jest.Mock).mock.calls;
        const stdoutContent = stdoutCalls.map((call: any[]) => call[0]).join('');
        
        // Should contain report content
        expect(stdoutContent).toContain('# Debate:');
        expect(stdoutContent).toContain('Test problem description');
        expect(stdoutContent).toContain('## Problem Description');
        expect(stdoutContent).toContain('## Agents');
        expect(stdoutContent).toContain('## Judge');
        expect(stdoutContent).toContain('## Rounds');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should generate report and write to file when output path provided', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const outputPath = path.join(tmpDir, 'report.md');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath, '--output', outputPath]);
        
        // Should create output file
        expect(fs.existsSync(outputPath)).toBe(true);
        
        // Should contain report content
        const reportContent = fs.readFileSync(outputPath, 'utf-8');
        expect(reportContent).toContain('# Debate:');
        expect(reportContent).toContain('Test problem description');
        expect(reportContent).toContain('## Problem Description');
        expect(reportContent).toContain('## Agents');
        expect(reportContent).toContain('## Judge');
        expect(reportContent).toContain('## Rounds');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should create parent directories when output path is provided', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const outputPath = path.join(tmpDir, 'nested', 'dir', 'report.md');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath, '--output', outputPath]);
        
        // Should create nested directories and file
        expect(fs.existsSync(outputPath)).toBe(true);
        
        // Should contain report content
        const reportContent = fs.readFileSync(outputPath, 'utf-8');
        expect(reportContent).toContain('# Debate:');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should overwrite existing file when output path exists', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const outputPath = path.join(tmpDir, 'report.md');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create existing output file
      fs.writeFileSync(outputPath, 'old content');

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath, '--output', outputPath]);
        
        // Should overwrite with new content
        const reportContent = fs.readFileSync(outputPath, 'utf-8');
        expect(reportContent).not.toContain('old content');
        expect(reportContent).toContain('# Debate:');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should use custom config file when --config provided', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const configPath = path.join(tmpDir, 'custom-config.json');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      await runCli(['report', '--debate', debatePath, '--config', configPath]);
      
      // Should succeed and write to stdout
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should include verbose metadata when --verbose flag is provided', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      // Add metadata to contribution
      debateState.rounds[0].contributions[0].metadata = {
        latencyMs: 1234,
        tokensUsed: 567,
        model: 'gpt-4'
      };
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath, '--verbose']);
        
        // Should write to stdout
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutCalls = (stdoutSpy as jest.Mock).mock.calls;
        const stdoutContent = stdoutCalls.map((call: any[]) => call[0]).join('');
        
        // Should contain verbose metadata
        expect(stdoutContent).toContain('latency=');
        expect(stdoutContent).toContain('tokens=');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should match agent configs by ID from debate state', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      // Add another agent to debate
      debateState.rounds[0].contributions.push({
        agentId: 'agent-performance',
        agentRole: 'performance',
        type: 'proposal',
        content: 'Performance proposal',
        metadata: {}
      });
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create config with multiple agents
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      config.agents.push({
        id: 'agent-performance',
        name: 'Performance Engineer',
        role: 'performance',
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.6
      });
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath]);
        
        // Should write to stdout
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutCalls = (stdoutSpy as jest.Mock).mock.calls;
        const stdoutContent = stdoutCalls.map((call: any[]) => call[0]).join('');
        
        // Should contain both agents
        expect(stdoutContent).toContain('System Architect');
        expect(stdoutContent).toContain('Performance Engineer');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should handle clarifications in debate state', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      debateState.clarifications = [
        {
          agentId: 'agent-architect',
          agentName: 'System Architect',
          role: 'architect',
          items: [
            {
              id: 'q1',
              question: 'What is the expected scale?',
              answer: '1000 users'
            }
          ]
        }
      ];
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath]);
        
        // Should write to stdout
        expect(stdoutSpy).toHaveBeenCalled();
        const stdoutCalls = (stdoutSpy as jest.Mock).mock.calls;
        const stdoutContent = stdoutCalls.map((call: any[]) => call[0]).join('');
        
        // Should contain clarifications section
        expect(stdoutContent).toContain('## Clarifications');
        expect(stdoutContent).toContain('What is the expected scale?');
        expect(stdoutContent).toContain('1000 users');
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });

    it('should handle Date objects in debate state (revive from strings)', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      // Serialize dates as strings (as they would be in JSON)
      const serializedState = JSON.parse(JSON.stringify(debateState));
      fs.writeFileSync(debatePath, JSON.stringify(serializedState));

      // Create default config file
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = createMinimalConfig();
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await runCli(['report', '--debate', debatePath]);
        
        // Should succeed (dates are revived)
        expect(stdoutSpy).toHaveBeenCalled();
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });
  });

  describe('Error handling', () => {
    it('should exit with invalid args when config is missing judge', async () => {
      const debatePath = path.join(tmpDir, 'debate.json');
      const debateState = createMinimalDebateState();
      fs.writeFileSync(debatePath, JSON.stringify(debateState));

      // Create config without judge
      const configPath = path.join(process.cwd(), 'debate-config.json');
      const config = {
        agents: createMinimalConfig().agents
        // No judge
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      try {
        await expect(runCli(['report', '--debate', debatePath]))
          .rejects.toHaveProperty('code', EXIT_INVALID_ARGS);
      } finally {
        // Clean up config file
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    });
  });
});

