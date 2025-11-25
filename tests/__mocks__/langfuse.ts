// Mock for langfuse package to avoid ESM import issues in Jest
export class Langfuse {
  constructor(_config?: any) {}
  trace(_config?: any) {
    const mockGeneration = {
      end: jest.fn(),
    };
    const mockSpan = {
      end: jest.fn(),
      generation: jest.fn().mockReturnValue(mockGeneration),
    };
    return {
      id: 'mock-trace-id',
      span: jest.fn().mockReturnValue(mockSpan),
      generation: jest.fn().mockReturnValue(mockGeneration),
      currentSpan: jest.fn().mockReturnValue(mockSpan),
    };
  }
  flushAsync() {
    return Promise.resolve();
  }
}

