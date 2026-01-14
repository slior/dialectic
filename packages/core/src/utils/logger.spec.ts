import { Logger } from './logger';

describe('Logger', () => {
  it('prints minimal messages in non-verbose mode', () => {
    const logger = new Logger(false);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.info('hello');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('prints additional details in verbose mode', () => {
    const logger = new Logger(true);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.debug('details');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

