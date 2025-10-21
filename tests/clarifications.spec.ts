// Mock OpenAI SDK to avoid network calls during CLI tests
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAIMock {
      public chat = {
        completions: {
          create: async (_: any) => ({ choices: [{ message: { content: 'Solution text' } }] }),
        },
      };
      constructor(_opts: any) {}
    },
  };
});

// Mock env-loader
jest.mock('../src/utils/env-loader', () => ({
  loadEnvironmentFile: jest.fn()
}));

// Mock readline module
jest.mock('readline', () => {
  let mockAnswers: string[] = [];
  let currentIndex = 0;
  
  return {
    __esModule: true,
    default: {
      createInterface: () => ({
        question: (_: any, cb: (ans: string) => void) => {
          const ans = currentIndex < mockAnswers.length ? mockAnswers[currentIndex++] : '';
          // Use setImmediate to make it async like real readline
          setImmediate(() => cb(String(ans)));
        },
        close: () => {},
      })
    },
    // Helper function to set mock answers
    __setMockAnswers: (answers: string[]) => {
      mockAnswers = answers;
      currentIndex = 0;
    }
  };
});

import os from 'os';
import path from 'path';
import fs from 'fs';
import { runCli } from '../src/cli/index';
import { loadEnvironmentFile } from '../src/utils/env-loader';
import { RoleBasedAgent } from '../src/agents/role-based-agent';

const mockedLoadEnvironmentFile = loadEnvironmentFile as jest.MockedFunction<typeof loadEnvironmentFile>;

describe('CLI clarifications phase', () => {
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test' };
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    mockedLoadEnvironmentFile.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function mockReadlineWithAnswers(answers: string[]) {
    // Set mock answers for the readline mock
    const readlineMock = require('readline');
    if (readlineMock.__setMockAnswers) {
      readlineMock.__setMockAnswers(answers);
    }
  }

  it('runs clarifications when --clarify and collects answers (including NA)', async () => {
    // Two questions total across agents; provide one answer and one empty -> NA
    mockReadlineWithAnswers(['My answer', '']);

    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValueOnce({ questions: [{ id: 'q1', text: 'What is the SLA?' }] })
      .mockResolvedValueOnce({ questions: [{ id: 'q1', text: 'Any data retention rules?' }] });

    const tmpReport = path.join(os.tmpdir(), `clarify-report-${Date.now()}.md`);

    await runCli(['debate', 'Design Y', '--clarify', '--report', tmpReport]);

    expect(spy).toHaveBeenCalled();
    const content = fs.readFileSync(tmpReport, 'utf-8');
    expect(content).toContain('## Clarifications');
    expect(content).toContain('Question (q1):');
    // Should include the explicit answer
    expect(content).toContain('My answer');
    // And NA for the unanswered one
    expect(content).toContain('\n```text\nNA\n```');
  });

  it('does not run clarifications without --clarify (default off)', async () => {
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: [] });

    await runCli(['debate', 'Design Z']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('truncates questions per agent and warns', async () => {
    // Return 7 questions to trigger truncation to default 5
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `q${i + 1}`, text: `Q${i + 1}` }));
    const spy = jest.spyOn(RoleBasedAgent.prototype as any, 'askClarifyingQuestions')
      .mockResolvedValue({ questions: many });

    mockReadlineWithAnswers(new Array(10).fill('A'));

    await runCli(['debate', 'Design W', '--clarify']);
    expect(spy).toHaveBeenCalled();
    const stderr = (stderrSpy.mock.calls.map(args => String(args[0])).join(''));
    expect(stderr).toMatch(/limited to 5/);
  });
});


