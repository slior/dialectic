import { ToolSchema, ToolCall, ToolResult, ToolCallMetadata } from '@dialectic/core';

// Test constants
const TOOL_NAME_TEST = 'test_tool';
const TOOL_NAME_OPTIONAL = 'optional_tool';
const TOOL_DESCRIPTION_TEST = 'A test tool';
const TOOL_DESCRIPTION_OPTIONAL = 'Tool with optional parameters';
const TOOL_CALL_ID_123 = 'call_123';
const TOOL_CALL_ID_1 = 'call_1';
const TOOL_ROLE = 'tool';
const PARAM_TYPE_OBJECT = 'object';
const PARAM_TYPE_STRING = 'string';
const PARAM_NAME_TERM = 'term';
const PARAM_NAME_OPTIONAL = 'optional';
const PARAM_DESCRIPTION_SEARCH_TERM = 'Search term';
const TOOL_CALL_ARGS_SEARCH = '{"term":"search"}';
const TOOL_CALL_ARGS_EMPTY = '{}';
const RESULT_CONTENT_SUCCESS = '{"status":"success","result":{"matches":[]}}';
const RESULT_CONTENT_ERROR = '{"status":"error","error":"Tool not found"}';
const RESULT_CONTENT_SUCCESS_SIMPLE = '{"status":"success"}';
const RESULT_STATUS_ERROR = 'error';
const ERROR_MESSAGE_TOOL_NOT_FOUND = 'Tool not found';
const TOOL_CALL_ITERATIONS_1 = 1;

describe('Tool Types', () => {
  describe('ToolSchema', () => {
    it('should match OpenAI function calling schema format', () => {
      const schema: ToolSchema = {
        name: TOOL_NAME_TEST,
        description: TOOL_DESCRIPTION_TEST,
        parameters: {
          type: PARAM_TYPE_OBJECT,
          properties: {
            [PARAM_NAME_TERM]: {
              type: PARAM_TYPE_STRING,
              description: PARAM_DESCRIPTION_SEARCH_TERM,
            },
          },
          required: [PARAM_NAME_TERM],
        },
      };

      expect(schema.name).toBe(TOOL_NAME_TEST);
      expect(schema.description).toBe(TOOL_DESCRIPTION_TEST);
      expect(schema.parameters.type).toBe(PARAM_TYPE_OBJECT);
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.required).toEqual([PARAM_NAME_TERM]);
    });

    it('should support optional required field', () => {
      const schema: ToolSchema = {
        name: TOOL_NAME_OPTIONAL,
        description: TOOL_DESCRIPTION_OPTIONAL,
        parameters: {
          type: PARAM_TYPE_OBJECT,
          properties: {
            [PARAM_NAME_OPTIONAL]: {
              type: PARAM_TYPE_STRING,
            },
          },
        },
      };

      expect(schema.parameters.required).toBeUndefined();
    });
  });

  describe('ToolCall', () => {
    it('should have id, name, and arguments fields', () => {
      const toolCall: ToolCall = {
        id: TOOL_CALL_ID_123,
        name: TOOL_NAME_TEST,
        arguments: TOOL_CALL_ARGS_SEARCH,
      };

      expect(toolCall.id).toBe(TOOL_CALL_ID_123);
      expect(toolCall.name).toBe(TOOL_NAME_TEST);
      expect(toolCall.arguments).toBe(TOOL_CALL_ARGS_SEARCH);
    });
  });

  describe('ToolResult', () => {
    it('should match OpenAI format with tool_call_id, role, and content', () => {
      const result: ToolResult = {
        tool_call_id: TOOL_CALL_ID_123,
        role: TOOL_ROLE,
        content: RESULT_CONTENT_SUCCESS,
      };

      expect(result.tool_call_id).toBe(TOOL_CALL_ID_123);
      expect(result.role).toBe(TOOL_ROLE);
      expect(result.content).toBeDefined();
    });

    it('should support error status in content', () => {
      const result: ToolResult = {
        tool_call_id: TOOL_CALL_ID_123,
        role: TOOL_ROLE,
        content: RESULT_CONTENT_ERROR,
      };

      const parsed = JSON.parse(result.content);
      expect(parsed.status).toBe(RESULT_STATUS_ERROR);
      expect(parsed.error).toBe(ERROR_MESSAGE_TOOL_NOT_FOUND);
    });
  });

  describe('ToolCallMetadata', () => {
    it('should have optional toolCalls, toolResults, and toolCallIterations fields', () => {
      const metadata: ToolCallMetadata = {
        toolCalls: [
          {
            id: TOOL_CALL_ID_1,
            name: TOOL_NAME_TEST,
            arguments: TOOL_CALL_ARGS_EMPTY,
          },
        ],
        toolResults: [
          {
            tool_call_id: TOOL_CALL_ID_1,
            role: TOOL_ROLE,
            content: RESULT_CONTENT_SUCCESS_SIMPLE,
          },
        ],
        toolCallIterations: TOOL_CALL_ITERATIONS_1,
      };

      expect(metadata.toolCalls).toBeDefined();
      expect(metadata.toolResults).toBeDefined();
      expect(metadata.toolCallIterations).toBe(TOOL_CALL_ITERATIONS_1);
    });

    it('should allow all fields to be optional', () => {
      const metadata: ToolCallMetadata = {};
      expect(metadata.toolCalls).toBeUndefined();
      expect(metadata.toolResults).toBeUndefined();
      expect(metadata.toolCallIterations).toBeUndefined();
    });
  });
});

