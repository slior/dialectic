import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolvePrompt } from '@dialectic/core';

describe('resolvePrompt', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('returns built-in when no path provided', () => {
    const res = resolvePrompt({ label: 'Agent A', configDir: tmpDir, defaultText: 'DEFAULT' });
    expect(res.source).toBe('built-in');
    expect(res.text).toBe('DEFAULT');
  });

  it('resolves relative path and reads entire file', () => {
    const p = path.join(tmpDir, 'a.md');
    fs.writeFileSync(p, '# Title\nHello world');
    const res = resolvePrompt({ label: 'Agent B', configDir: tmpDir, promptPath: 'a.md', defaultText: 'DEFAULT' });
    expect(res.source).toBe('file');
    expect(res.absPath).toBe(p);
    expect(res.text).toContain('Hello world');
  });

  it('falls back on missing file with warning', () => {
    const res = resolvePrompt({ label: 'Agent C', configDir: tmpDir, promptPath: 'missing.md', defaultText: 'DEFAULT' });
    expect(res.source).toBe('built-in');
    expect(res.text).toBe('DEFAULT');
  });

  it('falls back on empty file', () => {
    const p = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(p, '   \n\t');
    const res = resolvePrompt({ label: 'Agent D', configDir: tmpDir, promptPath: 'empty.md', defaultText: 'DEFAULT' });
    expect(res.source).toBe('built-in');
    expect(res.text).toBe('DEFAULT');
  });

  it('accepts absolute path', () => {
    const p = path.join(tmpDir, 'abs.md');
    fs.writeFileSync(p, 'ABC');
    const res = resolvePrompt({ label: 'Agent E', configDir: tmpDir, promptPath: p, defaultText: 'DEFAULT' });
    expect(res.source).toBe('file');
    expect(res.absPath).toBe(p);
    expect(res.text).toBe('ABC');
  });
});

