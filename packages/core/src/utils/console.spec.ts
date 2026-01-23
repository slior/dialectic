import {
  logInfo,
  logSuccess,
  logWarning,
  writeStderr,
  MessageType,
  MESSAGE_ICONS
} from './console';

describe('console utilities', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  describe('MessageType enum', () => {
    it('should have correct enum values', () => {
      expect(MessageType.INFO).toBe('info');
      expect(MessageType.SUCCESS).toBe('success');
      expect(MessageType.WARNING).toBe('warning');
    });
  });

  describe('MESSAGE_ICONS constant', () => {
    it('should export correct icon constants', () => {
      expect(MESSAGE_ICONS.INFO).toBe('ℹ');
      expect(MESSAGE_ICONS.SUCCESS).toBe('✓');
      expect(MESSAGE_ICONS.WARNING).toBe('⚠');
    });
  });

  describe('logInfo', () => {
    it('should call console.error with formatted info message', () => {
      const message = 'Test info message';
      logInfo(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.INFO);
      expect(callArg).toContain(message);
    });

    it('should format message with icon and spacing', () => {
      const message = 'Another info message';
      logInfo(message);

      const callArg = consoleErrorSpy.mock.calls[0][0];
      // Should contain icon, spacing (two spaces), and message
      // Allow for ANSI color codes that may wrap the icon
      expect(callArg).toContain(MESSAGE_ICONS.INFO);
      expect(callArg).toContain(message);
      expect(callArg).toMatch(/\s{2}/); // Verify two spaces are present
    });

    it('should handle empty string message', () => {
      logInfo('');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.INFO);
    });

    it('should handle special characters in message', () => {
      const message = 'Message with special chars: !@#$%^&*()';
      logInfo(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(message);
    });

    it('should handle multiline message', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      logInfo(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(message);
    });
  });

  describe('logSuccess', () => {
    it('should call console.error with formatted success message', () => {
      const message = 'Test success message';
      logSuccess(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.SUCCESS);
      expect(callArg).toContain(message);
    });

    it('should format message with icon and spacing', () => {
      const message = 'Operation completed successfully';
      logSuccess(message);

      const callArg = consoleErrorSpy.mock.calls[0][0];
      // Should contain icon, spacing (two spaces), and message
      // Allow for ANSI color codes that may wrap the icon
      expect(callArg).toContain(MESSAGE_ICONS.SUCCESS);
      expect(callArg).toContain(message);
      expect(callArg).toMatch(/\s{2}/); // Verify two spaces are present
    });

    it('should handle empty string message', () => {
      logSuccess('');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.SUCCESS);
    });

    it('should handle special characters in message', () => {
      const message = 'Success: ✓ Done!';
      logSuccess(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(message);
    });
  });

  describe('logWarning', () => {
    it('should call console.error with formatted warning message', () => {
      const message = 'Test warning message';
      logWarning(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.WARNING);
      expect(callArg).toContain(message);
    });

    it('should format message with icon and spacing', () => {
      const message = 'This is a warning';
      logWarning(message);

      const callArg = consoleErrorSpy.mock.calls[0][0];
      // Should contain icon, spacing (two spaces), and message
      // Allow for ANSI color codes that may wrap the icon
      expect(callArg).toContain(MESSAGE_ICONS.WARNING);
      expect(callArg).toContain(message);
      expect(callArg).toMatch(/\s{2}/); // Verify two spaces are present
    });

    it('should handle empty string message', () => {
      logWarning('');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(MESSAGE_ICONS.WARNING);
    });

    it('should handle special characters in message', () => {
      const message = 'Warning: ⚠ Be careful!';
      logWarning(message);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const callArg = consoleErrorSpy.mock.calls[0][0];
      expect(callArg).toContain(message);
    });
  });

  describe('writeStderr', () => {
    it('should call process.stderr.write with message', () => {
      const message = 'Test stderr message';
      writeStderr(message);

      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith(message);
    });

    it('should handle empty string message', () => {
      writeStderr('');

      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith('');
    });

    it('should handle multiline message', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      writeStderr(message);

      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith(message);
    });

    it('should handle special characters', () => {
      const message = 'Special: !@#$%^&*()';
      writeStderr(message);

      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith(message);
    });

    it('should handle multiple consecutive calls', () => {
      writeStderr('Message 1');
      writeStderr('Message 2');
      writeStderr('Message 3');

      expect(stderrWriteSpy).toHaveBeenCalledTimes(3);
      expect(stderrWriteSpy).toHaveBeenNthCalledWith(1, 'Message 1');
      expect(stderrWriteSpy).toHaveBeenNthCalledWith(2, 'Message 2');
      expect(stderrWriteSpy).toHaveBeenNthCalledWith(3, 'Message 3');
    });
  });

  describe('message formatting integration', () => {
    it('should format all message types correctly', () => {
      logInfo('Info message');
      logSuccess('Success message');
      logWarning('Warning message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      
      const infoCall = consoleErrorSpy.mock.calls[0][0];
      const successCall = consoleErrorSpy.mock.calls[1][0];
      const warningCall = consoleErrorSpy.mock.calls[2][0];

      expect(infoCall).toContain(MESSAGE_ICONS.INFO);
      expect(infoCall).toContain('Info message');
      
      expect(successCall).toContain(MESSAGE_ICONS.SUCCESS);
      expect(successCall).toContain('Success message');
      
      expect(warningCall).toContain(MESSAGE_ICONS.WARNING);
      expect(warningCall).toContain('Warning message');
    });

    it('should maintain consistent spacing between icon and message', () => {
      logInfo('Test');
      logSuccess('Test');
      logWarning('Test');

      const calls = consoleErrorSpy.mock.calls.map(call => call[0]);
      
      // All calls should have two spaces after the icon
      calls.forEach(call => {
        // Extract the part after the icon (which includes ANSI color codes)
        // The spacing should be consistent: icon + color codes + two spaces + message
        expect(call).toMatch(/\s{2}Test/);
      });
    });
  });

  describe('chalk fallback behavior', () => {
    it('should handle chalk module not being available gracefully', () => {
      // The module uses a try-catch to handle missing chalk
      // We can't directly test the fallback without module manipulation,
      // but we can verify the functions still work when chalk is available
      const message = 'Test message';
      
      logInfo(message);
      logSuccess(message);
      logWarning(message);

      // All should work regardless of chalk availability
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    });

    it('should use fallback proxy when chalk require fails', () => {
      // Test the fallback scenario by isolating modules and mocking chalk to throw
      jest.isolateModules(() => {
        // Mock chalk to throw an error when required
        jest.doMock('chalk', () => {
          throw new Error('Cannot find module \'chalk\'');
        }, { virtual: false });

        try {
          // Re-import the console module - this should trigger the catch block (lines 17-18)
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const consoleUtilsFallback = require('./console');
          
          // Clear previous calls
          consoleErrorSpy.mockClear();
          
          // Test that functions work with fallback proxy
          const message = 'Test message with fallback';
          consoleUtilsFallback.logInfo(message);
          consoleUtilsFallback.logSuccess(message);
          consoleUtilsFallback.logWarning(message);

          expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
          
          // Verify messages contain icons and messages
          // With fallback proxy, color functions return text as-is (no ANSI codes)
          const calls = consoleErrorSpy.mock.calls.map(call => call[0]);
          calls.forEach(call => {
            expect(call).toContain(message);
            // Should contain icons (fallback still formats with icons)
            expect(
              call.includes(consoleUtilsFallback.MESSAGE_ICONS.INFO) ||
              call.includes(consoleUtilsFallback.MESSAGE_ICONS.SUCCESS) ||
              call.includes(consoleUtilsFallback.MESSAGE_ICONS.WARNING)
            ).toBe(true);
          });
        } finally {
          jest.dontMock('chalk');
        }
      });
    });
  });
});
