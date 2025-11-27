import { Logger } from '../src/utils/logger';

describe('Logger', () => {
  it('prints minimal messages in non-verbose mode', () => {
    const logger = new Logger(false);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(((() => {}) as any));
    logger.info('hello');
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('prints additional details in verbose mode', () => {
    const logger = new Logger(true);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(((() => {}) as any));
    logger.debug('details');
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
