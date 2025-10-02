import { Logger } from '../src/utils/logger';

describe('Logger', () => {
  it('prints minimal messages in non-verbose mode', () => {
    const logger = new Logger(false);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(((() => {}) as any));
    logger.info('hello');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('prints additional details in verbose mode', () => {
    const logger = new Logger(true);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(((() => {}) as any));
    logger.debug('details');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
