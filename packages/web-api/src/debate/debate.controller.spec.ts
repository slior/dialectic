import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DebateController } from './debate.controller';
import { StateManager, DebateState, DEBATE_STATUS } from '@dialectic/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock @dialectic/core dependencies
jest.mock('@dialectic/core', () => {
  const actual = jest.requireActual('@dialectic/core');
  return {
    ...actual,
  };
});

// Test constants
const TEST_DEBATE_ID = 'deb-test-123';
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
    // Replace the StateManager instance with one pointing to our test directory
    (controller as any).stateManager = stateManager;
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
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
  });

  describe('GET /api/debates/:id/download', () => {
    it('should download debate JSON', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);
      const mockResponse = {
        setHeader: jest.fn(),
      } as any;

      const result = await controller.downloadDebate(state.id, mockResponse);

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
      const mockResponse = {
        setHeader: jest.fn(),
      } as any;

      await expect(
        controller.downloadDebate('nonexistent-id', mockResponse)
      ).rejects.toThrow(NotFoundException);
    });

    it('should include userFeedback in downloaded JSON', async () => {
      const state = await stateManager.createDebate(TEST_PROBLEM);
      await stateManager.updateUserFeedback(state.id, TEST_FEEDBACK_POSITIVE);

      const mockResponse = {
        setHeader: jest.fn(),
      } as any;

      const result = await controller.downloadDebate(state.id, mockResponse);

      expect(result).toEqual(
        expect.objectContaining({
          id: state.id,
          userFeedback: TEST_FEEDBACK_POSITIVE,
        })
      );
    });
  });
});

