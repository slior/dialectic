import { loadConfig } from '../src/cli/commands/debate';
import { DEFAULT_SUMMARIZATION_ENABLED, DEFAULT_SUMMARIZATION_THRESHOLD, DEFAULT_SUMMARIZATION_MAX_LENGTH, DEFAULT_SUMMARIZATION_METHOD } from '../src/types/config.types';
import fs from 'fs';
import path from 'path';
import os from 'os';

// RED-phase: config loader behavior tests; module not implemented yet.

describe('Configuration loading', () => {
  it('uses built-in defaults when ./debate-config.json is missing and emits a stderr notice', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cfg = await loadConfig(undefined);
    expect(cfg).toBeDefined();
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('Summarization configuration loading', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should load default summarization config when not specified', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const cfg = await loadConfig(undefined);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(DEFAULT_SUMMARIZATION_ENABLED);
    expect(cfg.debate?.summarization?.threshold).toBe(DEFAULT_SUMMARIZATION_THRESHOLD);
    expect(cfg.debate?.summarization?.maxLength).toBe(DEFAULT_SUMMARIZATION_MAX_LENGTH);
    expect(cfg.debate?.summarization?.method).toBe(DEFAULT_SUMMARIZATION_METHOD);
    
    stderrSpy.mockRestore();
  });

  it('should load custom summarization config from file', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        summarization: {
          enabled: false,
          threshold: 3000,
          maxLength: 1500,
          method: 'length-based'
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.enabled).toBe(false);
    expect(cfg.debate?.summarization?.threshold).toBe(3000);
    expect(cfg.debate?.summarization?.maxLength).toBe(1500);
    expect(cfg.debate?.summarization?.method).toBe('length-based');
  });

  it('should support per-agent summarization override', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          summarization: {
            enabled: true,
            threshold: 2000,
            maxLength: 1000,
            method: 'length-based'
          }
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summarization).toBeDefined();
    expect(agent!.summarization?.enabled).toBe(true);
    expect(agent!.summarization?.threshold).toBe(2000);
    expect(agent!.summarization?.maxLength).toBe(1000);
  });

  it('should support summaryPromptPath in agent config', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5,
          summaryPromptPath: './prompts/custom-summary.md'
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    const agent = cfg.agents[0];
    expect(agent).toBeDefined();
    expect(agent!.summaryPromptPath).toBe('./prompts/custom-summary.md');
  });

  it('should support partial summarization config', async () => {
    const configPath = path.join(tmpDir, 'test-config.json');
    const configContent = {
      agents: [
        {
          id: 'test-agent',
          name: 'Test Agent',
          role: 'architect',
          model: 'gpt-4',
          provider: 'openai',
          temperature: 0.5
        }
      ],
      debate: {
        rounds: 3,
        terminationCondition: { type: 'fixed' },
        synthesisMethod: 'judge',
        includeFullHistory: true,
        timeoutPerRound: 300000,
        summarization: {
          threshold: 10000
          // Other fields should use defaults
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    const cfg = await loadConfig(configPath);
    
    expect(cfg.debate?.summarization).toBeDefined();
    expect(cfg.debate?.summarization?.threshold).toBe(10000);
    // Partial config should work with merging at runtime
  });
});

