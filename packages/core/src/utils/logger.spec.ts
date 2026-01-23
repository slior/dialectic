import * as consoleUtils from './console';
import { Logger } from './logger';

describe('Logger', () => {
  let logInfoSpy: jest.SpyInstance;
  let logSuccessSpy: jest.SpyInstance;
  let logWarningSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    logInfoSpy = jest.spyOn(consoleUtils, 'logInfo').mockImplementation(() => {});
    logSuccessSpy = jest.spyOn(consoleUtils, 'logSuccess').mockImplementation(() => {});
    logWarningSpy = jest.spyOn(consoleUtils, 'logWarning').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logInfoSpy.mockRestore();
    logSuccessSpy.mockRestore();
    logWarningSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default verbose=false', () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should create logger with verbose=false', () => {
      const logger = new Logger(false);
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should create logger with verbose=true', () => {
      const logger = new Logger(true);
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('info', () => {
    it('should call logInfo with the message', () => {
      const logger = new Logger();
      const message = 'Test info message';
      
      logger.info(message);
      
      expect(logInfoSpy).toHaveBeenCalledTimes(1);
      expect(logInfoSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('success', () => {
    it('should call logSuccess with the message', () => {
      const logger = new Logger();
      const message = 'Test success message';
      
      logger.success(message);
      
      expect(logSuccessSpy).toHaveBeenCalledTimes(1);
      expect(logSuccessSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('warn', () => {
    it('should call logWarning with the message', () => {
      const logger = new Logger();
      const message = 'Test warning message';
      
      logger.warn(message);
      
      expect(logWarningSpy).toHaveBeenCalledTimes(1);
      expect(logWarningSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('error', () => {
    it('should call logWarning with the message', () => {
      const logger = new Logger();
      const message = 'Test error message';
      
      logger.error(message);
      
      expect(logWarningSpy).toHaveBeenCalledTimes(1);
      expect(logWarningSpy).toHaveBeenCalledWith(message);
    });
  });

  describe('debug', () => {
    it('should not call logInfo when verbose is false', () => {
      const logger = new Logger(false);
      const message = 'Test debug message';
      
      logger.debug(message);
      
      expect(logInfoSpy).not.toHaveBeenCalled();
    });

    it('should call logInfo when verbose is true', () => {
      const logger = new Logger(true);
      const message = 'Test debug message';
      
      logger.debug(message);
      
      expect(logInfoSpy).toHaveBeenCalledTimes(1);
      expect(logInfoSpy).toHaveBeenCalledWith(message);
    });

    it('should call logInfo when verbose is true and called multiple times', () => {
      const logger = new Logger(true);
      const message1 = 'Debug message 1';
      const message2 = 'Debug message 2';
      
      logger.debug(message1);
      logger.debug(message2);
      
      expect(logInfoSpy).toHaveBeenCalledTimes(2);
      expect(logInfoSpy).toHaveBeenNthCalledWith(1, message1);
      expect(logInfoSpy).toHaveBeenNthCalledWith(2, message2);
    });
  });

  describe('agentAction', () => {
    it('should call console.log with formatted agent action', () => {
      const logger = new Logger();
      const agentName = 'TestAgent';
      const action = 'Executing tool: test_tool';
      
      logger.agentAction(agentName, action);
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(`[${agentName}] ${action}`);
    });

    it('should format agent action correctly with different agent names', () => {
      const logger = new Logger();
      
      logger.agentAction('Agent1', 'Action1');
      logger.agentAction('Agent2', 'Action2');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '[Agent1] Action1');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '[Agent2] Action2');
    });
  });

  describe('separator', () => {
    it('should call console.log with separator line', () => {
      const logger = new Logger();
      const expectedSeparator = '━'.repeat(60);
      
      logger.separator();
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expectedSeparator);
    });

    it('should call console.log with correct separator length', () => {
      const logger = new Logger();
      
      logger.separator();
      
      const callArgs = consoleLogSpy.mock.calls[0][0];
      expect(callArgs).toHaveLength(60);
      expect(callArgs).toBe('━'.repeat(60));
    });
  });

  describe('integration', () => {
    it('should handle multiple method calls in sequence', () => {
      const logger = new Logger(true);
      
      logger.info('Info message');
      logger.success('Success message');
      logger.warn('Warning message');
      logger.error('Error message');
      logger.debug('Debug message');
      logger.agentAction('Agent', 'Action');
      logger.separator();
      
      expect(logInfoSpy).toHaveBeenCalledTimes(2); // info + debug
      expect(logSuccessSpy).toHaveBeenCalledTimes(1);
      expect(logWarningSpy).toHaveBeenCalledTimes(2); // warn + error
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // agentAction + separator
    });

    it('should work correctly with verbose=false for all methods except debug', () => {
      const logger = new Logger(false);
      
      logger.info('Info');
      logger.success('Success');
      logger.warn('Warning');
      logger.error('Error');
      logger.debug('Debug');
      logger.agentAction('Agent', 'Action');
      logger.separator();
      
      expect(logInfoSpy).toHaveBeenCalledTimes(1); // only info
      expect(logSuccessSpy).toHaveBeenCalledTimes(1);
      expect(logWarningSpy).toHaveBeenCalledTimes(2); // warn + error
      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // agentAction + separator
    });
  });
});

