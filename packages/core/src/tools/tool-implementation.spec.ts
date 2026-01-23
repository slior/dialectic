import { CHAT_ROLES } from '../providers/llm-provider';
import { TOOL_RESULT_STATUS } from '../types/tool.types';

import {
  createToolErrorJson,
  createToolSuccessJson,
  createToolResult,
} from './tool-implementation';

// Test constants
const STATUS_SUCCESS = TOOL_RESULT_STATUS.SUCCESS;
const STATUS_ERROR = TOOL_RESULT_STATUS.ERROR;
const ROLE_TOOL = CHAT_ROLES.TOOL;
const CALL_ID_1 = 'call-123';
const CALL_ID_2 = 'call-456';
const ERROR_MESSAGE_BASIC = 'Something went wrong';
const ERROR_MESSAGE_EMPTY = '';
const ERROR_MESSAGE_SPECIAL = 'Error with "quotes" and \'apostrophes\' and\nnewlines';
const ERROR_MESSAGE_LONG = 'A'.repeat(1000);
const RESULT_OBJECT = { key: 'value', number: 42 };
const RESULT_ARRAY = [1, 2, 3, 'test'];
const RESULT_STRING = 'test result';
const RESULT_NUMBER = 42;
const RESULT_BOOLEAN_TRUE = true;
const RESULT_BOOLEAN_FALSE = false;
const RESULT_NULL = null;
const RESULT_NESTED = {
  level1: {
    level2: {
      level3: 'deep value',
      array: [1, 2, { nested: 'object' }],
    },
  },
};

describe('tool-implementation', () => {
  describe('createToolErrorJson', () => {
    it('should create error JSON with basic error message', () => {
      const result = createToolErrorJson(ERROR_MESSAGE_BASIC);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_MESSAGE_BASIC);
      expect(parsed.result).toBeUndefined();
    });

    it('should create error JSON with empty error message', () => {
      const result = createToolErrorJson(ERROR_MESSAGE_EMPTY);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_MESSAGE_EMPTY);
    });

    it('should create error JSON with special characters', () => {
      const result = createToolErrorJson(ERROR_MESSAGE_SPECIAL);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_MESSAGE_SPECIAL);
    });

    it('should create error JSON with long error message', () => {
      const result = createToolErrorJson(ERROR_MESSAGE_LONG);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_MESSAGE_LONG);
      expect(parsed.error.length).toBe(1000);
    });

    it('should return valid JSON string', () => {
      const result = createToolErrorJson(ERROR_MESSAGE_BASIC);
      
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('createToolSuccessJson', () => {
    it('should create success JSON with object result', () => {
      const result = createToolSuccessJson(RESULT_OBJECT);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toEqual(RESULT_OBJECT);
      expect(parsed.error).toBeUndefined();
    });

    it('should create success JSON with array result', () => {
      const result = createToolSuccessJson(RESULT_ARRAY);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toEqual(RESULT_ARRAY);
    });

    it('should create success JSON with string result', () => {
      const result = createToolSuccessJson(RESULT_STRING);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBe(RESULT_STRING);
    });

    it('should create success JSON with number result', () => {
      const result = createToolSuccessJson(RESULT_NUMBER);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBe(RESULT_NUMBER);
    });

    it('should create success JSON with boolean true result', () => {
      const result = createToolSuccessJson(RESULT_BOOLEAN_TRUE);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBe(true);
    });

    it('should create success JSON with boolean false result', () => {
      const result = createToolSuccessJson(RESULT_BOOLEAN_FALSE);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBe(false);
    });

    it('should create success JSON with null result', () => {
      const result = createToolSuccessJson(RESULT_NULL);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBeNull();
    });

    it('should create success JSON with undefined result', () => {
      const result = createToolSuccessJson(undefined);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toBeUndefined();
    });

    it('should create success JSON with nested object result', () => {
      const result = createToolSuccessJson(RESULT_NESTED);
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe(STATUS_SUCCESS);
      expect(parsed.result).toEqual(RESULT_NESTED);
      expect(parsed.result.level1.level2.level3).toBe('deep value');
    });

    it('should return valid JSON string', () => {
      const result = createToolSuccessJson(RESULT_OBJECT);
      
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('result');
    });
  });

  describe('createToolResult', () => {
    describe('success status', () => {
      it('should create ToolResult with success status and result', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT);
        
        expect(toolResult).toBeDefined();
        expect(toolResult.tool_call_id).toBe(CALL_ID_1);
        expect(toolResult.role).toBe(ROLE_TOOL);
        expect(typeof toolResult.content).toBe('string');
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toEqual(RESULT_OBJECT);
        expect(content.error).toBeUndefined();
      });

      it('should create ToolResult with success status and string result', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_STRING);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toBe(RESULT_STRING);
      });

      it('should create ToolResult with success status and array result', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_ARRAY);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toEqual(RESULT_ARRAY);
      });

      it('should create ToolResult with success status and null result', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_NULL);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toBeNull();
      });

      it('should create ToolResult with success status and undefined result (no result property)', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, undefined);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toBeUndefined();
        expect(content).not.toHaveProperty('result');
      });

      it('should create ToolResult with success status and nested object result', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_NESTED);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toEqual(RESULT_NESTED);
      });

      it('should not include error property when status is success', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT, 'some error');
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_SUCCESS);
        expect(content.result).toEqual(RESULT_OBJECT);
        expect(content.error).toBeUndefined();
      });
    });

    describe('error status', () => {
      it('should create ToolResult with error status and error message', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_BASIC);
        
        expect(toolResult).toBeDefined();
        expect(toolResult.tool_call_id).toBe(CALL_ID_1);
        expect(toolResult.role).toBe(ROLE_TOOL);
        expect(typeof toolResult.content).toBe('string');
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_ERROR);
        expect(content.error).toBe(ERROR_MESSAGE_BASIC);
        expect(content.result).toBeUndefined();
      });

      it('should create ToolResult with error status and empty error message', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_EMPTY);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_ERROR);
        expect(content.error).toBe(ERROR_MESSAGE_EMPTY);
      });

      it('should create ToolResult with error status and special characters in error', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_SPECIAL);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_ERROR);
        expect(content.error).toBe(ERROR_MESSAGE_SPECIAL);
      });

      it('should create ToolResult with error status and undefined error (no error property)', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, undefined);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_ERROR);
        expect(content.error).toBeUndefined();
        expect(content).not.toHaveProperty('error');
      });

      it('should not include result property when status is error', () => {
        const toolResult = createToolResult(CALL_ID_1, STATUS_ERROR, RESULT_OBJECT, ERROR_MESSAGE_BASIC);
        
        const content = JSON.parse(toolResult.content);
        expect(content.status).toBe(STATUS_ERROR);
        expect(content.error).toBe(ERROR_MESSAGE_BASIC);
        expect(content.result).toBeUndefined();
      });
    });

    describe('general behavior', () => {
      it('should always set role to TOOL', () => {
        const successResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT);
        const errorResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_BASIC);
        
        expect(successResult.role).toBe(ROLE_TOOL);
        expect(errorResult.role).toBe(ROLE_TOOL);
      });

      it('should use provided call ID', () => {
        const result1 = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT);
        const result2 = createToolResult(CALL_ID_2, STATUS_SUCCESS, RESULT_OBJECT);
        
        expect(result1.tool_call_id).toBe(CALL_ID_1);
        expect(result2.tool_call_id).toBe(CALL_ID_2);
        expect(result1.tool_call_id).not.toBe(result2.tool_call_id);
      });

      it('should always return valid JSON in content', () => {
        const successResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT);
        const errorResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_BASIC);
        
        expect(() => JSON.parse(successResult.content)).not.toThrow();
        expect(() => JSON.parse(errorResult.content)).not.toThrow();
      });

      it('should always include status in content', () => {
        const successResult = createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT);
        const errorResult = createToolResult(CALL_ID_1, STATUS_ERROR, undefined, ERROR_MESSAGE_BASIC);
        
        const successContent = JSON.parse(successResult.content);
        const errorContent = JSON.parse(errorResult.content);
        
        expect(successContent).toHaveProperty('status');
        expect(errorContent).toHaveProperty('status');
        expect(successContent.status).toBe(STATUS_SUCCESS);
        expect(errorContent.status).toBe(STATUS_ERROR);
      });

      it('should handle different result types with success status', () => {
        const results = [
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_STRING),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_NUMBER),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_BOOLEAN_TRUE),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_BOOLEAN_FALSE),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_NULL),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_OBJECT),
          createToolResult(CALL_ID_1, STATUS_SUCCESS, RESULT_ARRAY),
        ];

        results.forEach((result) => {
          expect(result.role).toBe(ROLE_TOOL);
          expect(result.tool_call_id).toBe(CALL_ID_1);
          const content = JSON.parse(result.content);
          expect(content.status).toBe(STATUS_SUCCESS);
        });
      });
    });
  });
});
