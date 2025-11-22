import { ToolSchema, ToolCall, ToolResult, ToolCallMetadata } from '../src/types/tool.types';

describe('Tool Types', () => {
  describe('ToolSchema', () => {
    it('should match OpenAI function calling schema format', () => {
      const schema: ToolSchema = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            term: {
              type: 'string',
              description: 'Search term',
            },
          },
          required: ['term'],
        },
      };

      expect(schema.name).toBe('test_tool');
      expect(schema.description).toBe('A test tool');
      expect(schema.parameters.type).toBe('object');
      expect(schema.parameters.properties).toBeDefined();
      expect(schema.parameters.required).toEqual(['term']);
    });

    it('should support optional required field', () => {
      const schema: ToolSchema = {
        name: 'optional_tool',
        description: 'Tool with optional parameters',
        parameters: {
          type: 'object',
          properties: {
            optional: {
              type: 'string',
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
        id: 'call_123',
        name: 'test_tool',
        arguments: '{"term":"search"}',
      };

      expect(toolCall.id).toBe('call_123');
      expect(toolCall.name).toBe('test_tool');
      expect(toolCall.arguments).toBe('{"term":"search"}');
    });
  });

  describe('ToolResult', () => {
    it('should match OpenAI format with tool_call_id, role, and content', () => {
      const result: ToolResult = {
        tool_call_id: 'call_123',
        role: 'tool',
        content: '{"status":"success","result":{"matches":[]}}',
      };

      expect(result.tool_call_id).toBe('call_123');
      expect(result.role).toBe('tool');
      expect(result.content).toBeDefined();
    });

    it('should support error status in content', () => {
      const result: ToolResult = {
        tool_call_id: 'call_123',
        role: 'tool',
        content: '{"status":"error","error":"Tool not found"}',
      };

      const parsed = JSON.parse(result.content);
      expect(parsed.status).toBe('error');
      expect(parsed.error).toBe('Tool not found');
    });
  });

  describe('ToolCallMetadata', () => {
    it('should have optional toolCalls, toolResults, and toolCallIterations fields', () => {
      const metadata: ToolCallMetadata = {
        toolCalls: [
          {
            id: 'call_1',
            name: 'test_tool',
            arguments: '{}',
          },
        ],
        toolResults: [
          {
            tool_call_id: 'call_1',
            role: 'tool',
            content: '{"status":"success"}',
          },
        ],
        toolCallIterations: 1,
      };

      expect(metadata.toolCalls).toBeDefined();
      expect(metadata.toolResults).toBeDefined();
      expect(metadata.toolCallIterations).toBe(1);
    });

    it('should allow all fields to be optional', () => {
      const metadata: ToolCallMetadata = {};
      expect(metadata.toolCalls).toBeUndefined();
      expect(metadata.toolResults).toBeUndefined();
      expect(metadata.toolCallIterations).toBeUndefined();
    });
  });
});

