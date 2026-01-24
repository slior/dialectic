import fs from 'fs';
import os from 'os';
import path from 'path';

import { PROMPT_SOURCES } from '../types/agent.types';

import { readBuiltInPrompt, resolvePrompt } from './prompt-loader';

// Test constants
const PROMPT_SOURCE_BUILT_IN = PROMPT_SOURCES.BUILT_IN;
const PROMPT_SOURCE_FILE = PROMPT_SOURCES.FILE;
const DEFAULT_PROMPT_TEXT = 'DEFAULT';
const PROMPT_FILE_A = 'a.md';
const PROMPT_FILE_MISSING = 'missing.md';
const PROMPT_FILE_EMPTY = 'empty.md';
const PROMPT_FILE_ABS = 'abs.md';
const PROMPT_FILE_DIR = 'adir';
const PROMPT_FILE_READERR = 'readerr.md';
const FALLBACK_TEXT = 'FALLBACK';
const PROMPT_FILE_CONTENT_TITLE = '# Title\nHello world';
const PROMPT_FILE_CONTENT_ABC = 'ABC';
const PROMPT_FILE_CONTENT_WHITESPACE = '   \n\t';
const LABEL_AGENT_A = 'Agent A';
const LABEL_AGENT_B = 'Agent B';
const LABEL_AGENT_C = 'Agent C';
const LABEL_AGENT_D = 'Agent D';
const LABEL_AGENT_E = 'Agent E';
const TMP_DIR_PREFIX = 'prompt-test-';

describe('resolvePrompt', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_DIR_PREFIX));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {
      // Ignore cleanup errors
    }
  });

  it('returns built-in when no path provided', () => {
    const res = resolvePrompt({ label: LABEL_AGENT_A, configDir: tmpDir, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
    expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
  });

  it('resolves relative path and reads entire file', () => {
    const p = path.join(tmpDir, PROMPT_FILE_A);
    fs.writeFileSync(p, PROMPT_FILE_CONTENT_TITLE);
    const res = resolvePrompt({ label: LABEL_AGENT_B, configDir: tmpDir, promptPath: PROMPT_FILE_A, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_FILE);
    expect(res.absPath).toBe(p);
    expect(res.text).toContain('Hello world');
  });

  it('falls back on missing file with warning', () => {
    const res = resolvePrompt({ label: LABEL_AGENT_C, configDir: tmpDir, promptPath: PROMPT_FILE_MISSING, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
    expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
  });

  it('falls back on empty file', () => {
    const p = path.join(tmpDir, PROMPT_FILE_EMPTY);
    fs.writeFileSync(p, PROMPT_FILE_CONTENT_WHITESPACE);
    const res = resolvePrompt({ label: LABEL_AGENT_D, configDir: tmpDir, promptPath: PROMPT_FILE_EMPTY, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
    expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
  });

  it('accepts absolute path', () => {
    const p = path.join(tmpDir, PROMPT_FILE_ABS);
    fs.writeFileSync(p, PROMPT_FILE_CONTENT_ABC);
    const res = resolvePrompt({ label: LABEL_AGENT_E, configDir: tmpDir, promptPath: p, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_FILE);
    expect(res.absPath).toBe(p);
    expect(res.text).toBe(PROMPT_FILE_CONTENT_ABC);
  });

  it('returns built-in when promptPath is whitespace-only', () => {
    const res = resolvePrompt({ label: LABEL_AGENT_A, configDir: tmpDir, promptPath: '   \t\n  ', defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
    expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
  });

  it('falls back when path exists but is a directory', () => {
    const p = path.join(tmpDir, PROMPT_FILE_DIR);
    fs.mkdirSync(p, { recursive: true });
    const res = resolvePrompt({ label: LABEL_AGENT_B, configDir: tmpDir, promptPath: PROMPT_FILE_DIR, defaultText: DEFAULT_PROMPT_TEXT });
    expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
    expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
  });

  it('falls back when readFileSync throws', () => {
    const p = path.join(tmpDir, PROMPT_FILE_READERR);
    fs.writeFileSync(p, PROMPT_FILE_CONTENT_ABC);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('read error');
    });
    try {
      const res = resolvePrompt({ label: LABEL_AGENT_C, configDir: tmpDir, promptPath: PROMPT_FILE_READERR, defaultText: DEFAULT_PROMPT_TEXT });
      expect(res.source).toBe(PROMPT_SOURCE_BUILT_IN);
      expect(res.text).toBe(DEFAULT_PROMPT_TEXT);
    } finally {
      readSpy.mockRestore();
    }
  });
});

describe('readBuiltInPrompt', () => {
  const REL_PATH = 'some/nonexistent/prompt.md';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns file content when attempt1 (dist) succeeds', () => {
    const content = 'from-attempt1';
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(content);
    expect(readBuiltInPrompt(REL_PATH, FALLBACK_TEXT)).toBe(content);
  });

  it('returns file content when attempt1 fails and attempt2 succeeds', () => {
    const content = 'from-attempt2';
    jest
      .spyOn(fs, 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('not found');
      })
      .mockReturnValueOnce(content);
    expect(readBuiltInPrompt(REL_PATH, FALLBACK_TEXT)).toBe(content);
  });

  it('returns file content when attempt1 and attempt2 fail and attempt3 succeeds', () => {
    const content = 'from-attempt3';
    jest
      .spyOn(fs, 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('not found');
      })
      .mockImplementationOnce(() => {
        throw new Error('not found');
      })
      .mockReturnValueOnce(content);
    expect(readBuiltInPrompt(REL_PATH, FALLBACK_TEXT)).toBe(content);
  });

  it('returns fallback when all three attempts fail', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('not found');
    });
    expect(readBuiltInPrompt(REL_PATH, FALLBACK_TEXT)).toBe(FALLBACK_TEXT);
  });
});

