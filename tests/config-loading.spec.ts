import { loadConfig } from '../src/cli/commands/debate';

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
