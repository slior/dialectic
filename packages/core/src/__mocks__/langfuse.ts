// Mock for langfuse package to avoid ESM import issues in Jest
//it's ok to not use some of the variables here because we're mocking the whole class.
export class Langfuse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: unknown) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trace(_config?: unknown): {
    id: string;
    span: jest.Mock;
    generation: jest.Mock;
    currentSpan: jest.Mock;
  } {
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
  flushAsync(): Promise<void> {
    return Promise.resolve();
  }
}

