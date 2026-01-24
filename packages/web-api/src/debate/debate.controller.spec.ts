import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StateManager } from 'dialectic-core';
import { Response } from 'express';

import { DebateController } from './debate.controller';

/**
 * Mock Response type for testing - only includes the methods we need to mock.
 */
type MockResponse = Pick<Response, 'setHeader'>;

/**
 * Replaces the controller's private stateManager for tests.
 * Accepts StateManager or a partial mock with updateUserFeedback or getDebate.
 */
function setControllerStateManager(
  controller: DebateController,
  value:
    | StateManager
    | { updateUserFeedback: (id: string, feedback: number) => Promise<unknown> }
    | { getDebate: (id: string) => Promise<unknown> }
): void {
  Object.defineProperty(controller, 'stateManager', { value, writable: true, configurable: true });
}

// Mock dialectic-core dependencies
jest.mock('dialectic-core', () => {
  const actual = jest.requireActual('dialectic-core');
  return {
    ...actual,
  };
});

// Test constants
const TEST_PROBLEM = 'Test problem';
const TEST_FEEDBACK_POSITIVE = 1;
const TEST_FEEDBACK_NEGATIVE = -1;
const TEST_FEEDBACK_INVALID_ZERO = 0;
const TEST_FEEDBACK_INVALID_POSITIVE = 2;
const TEST_FEEDBACK_INVALID_NEGATIVE = -2;

describe('DebateController', () => {
  let controller: DebateController;
  let tmpDir: string;
  let stateManager: StateManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debate-controller-test-'));
    stateManager = new StateManager(tmpDir);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebateController],
    }).compile();

    controller = module.get<DebateController>(DebateController);
    setControllerStateManager(controller, stateManager);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/debates/:id/feedback', () => {
    it('should update feedback successfully', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);

      const result = await controller.submitFeedback(state.id, { feedback: TEST_FEEDBACK_POSITIVE });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Feedback submitted successfully');

      const updatedState = await stateManager.getDebate(state.id);
      expect(updatedState?.userFeedback).toBe(TEST_FEEDBACK_POSITIVE);
    });

    it('should accept negative feedback', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);

      const result = await controller.submitFeedback(state.id, { feedback: TEST_FEEDBACK_NEGATIVE });

      expect(result.success).toBe(true);

      const updatedState = await stateManager.getDebate(state.id);
      expect(updatedState?.userFeedback).toBe(TEST_FEEDBACK_NEGATIVE);
    });

    it('should return 400 for invalid feedback value (0)', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);

      await expect(
        controller.submitFeedback(state.id, { feedback: TEST_FEEDBACK_INVALID_ZERO })
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for feedback > 1', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);

      await expect(
        controller.submitFeedback(state.id, { feedback: TEST_FEEDBACK_INVALID_POSITIVE })
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for feedback < -1', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);

      await expect(
        controller.submitFeedback(state.id, { feedback: TEST_FEEDBACK_INVALID_NEGATIVE })
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 404 for non-existent debate', async () => {
      await expect(
        controller.submitFeedback('nonexistent-id', { feedback: TEST_FEEDBACK_POSITIVE })
      ).rejects.toThrow(NotFoundException);
    });

    it('should rethrow NotFoundException from StateManager', async () => {
      const notFound = new NotFoundException('Debate missing');
      const mockSm = { updateUserFeedback: jest.fn().mockRejectedValue(notFound) };
      setControllerStateManager(controller, mockSm);

      await expect(controller.submitFeedback('id', { feedback: TEST_FEEDBACK_POSITIVE })).rejects.toThrow(
        NotFoundException
      );
      await expect(controller.submitFeedback('id', { feedback: TEST_FEEDBACK_POSITIVE })).rejects.toMatchObject({
        message: 'Debate missing',
      });
    });

    it('should rethrow non-not-found errors from StateManager', async () => {
      const err = new Error('Permission denied');
      const mockSm = { updateUserFeedback: jest.fn().mockRejectedValue(err) };
      setControllerStateManager(controller, mockSm);

      await expect(controller.submitFeedback('id', { feedback: TEST_FEEDBACK_POSITIVE })).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should rethrow non-Error exceptions from StateManager', async () => {
      const mockSm = { updateUserFeedback: jest.fn().mockRejectedValue('disk error') };
      setControllerStateManager(controller, mockSm);

      await expect(controller.submitFeedback('id', { feedback: TEST_FEEDBACK_POSITIVE })).rejects.toEqual('disk error');
    });
  });

  describe('GET /api/debates/:id/download', () => {
    it('should download debate JSON', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);
      const mockResponse: MockResponse = {
        setHeader: jest.fn(),
      };

      const result = await controller.downloadDebate(state.id, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${state.id}.json"`
      );
      expect(result).toEqual(expect.objectContaining({
        id: state.id,
        problem: TEST_PROBLEM,
      }));
    });

    it('should return 404 for non-existent debate', async () => {
      const mockResponse: MockResponse = {
        setHeader: jest.fn(),
      };

      await expect(
        controller.downloadDebate('nonexistent-id', mockResponse as Response)
      ).rejects.toThrow(NotFoundException);
    });

    it('should include userFeedback in downloaded JSON', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);
      await stateManager.updateUserFeedback(state.id, TEST_FEEDBACK_POSITIVE);

      const mockResponse: MockResponse = {
        setHeader: jest.fn(),
      };

      const result = await controller.downloadDebate(state.id, mockResponse as Response);

      expect(result).toEqual(
        expect.objectContaining({
          id: state.id,
          userFeedback: TEST_FEEDBACK_POSITIVE,
        })
      );
    });

    it('should return 404 when getDebate throws with "not found" in message', async () => {
      const mockResponse: MockResponse = { setHeader: jest.fn() };
      const mockSm = { getDebate: jest.fn().mockRejectedValue(new Error('Debate x not found')) };
      setControllerStateManager(controller, mockSm);

      await expect(controller.downloadDebate('id', mockResponse as Response)).rejects.toThrow(NotFoundException);
    });

    it('should rethrow when getDebate throws non-not-found error', async () => {
      const err = new Error('ENOENT');
      const mockResponse: MockResponse = { setHeader: jest.fn() };
      const mockSm = { getDebate: jest.fn().mockRejectedValue(err) };
      setControllerStateManager(controller, mockSm);

      await expect(controller.downloadDebate('id', mockResponse as Response)).rejects.toThrow('ENOENT');
    });

    it('should rethrow NotFoundException when getDebate throws it', async () => {
      const notFound = new NotFoundException('Not found');
      const mockResponse: MockResponse = { setHeader: jest.fn() };
      const mockSm = { getDebate: jest.fn().mockRejectedValue(notFound) };
      setControllerStateManager(controller, mockSm);

      await expect(controller.downloadDebate('id', mockResponse as Response)).rejects.toThrow(NotFoundException);
    });
  });
});

