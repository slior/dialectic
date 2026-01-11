import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, NotFoundException, BadRequestException, Res } from '@nestjs/common';
import { StateManager, DebateState } from 'dialectic-core';
import { Response } from 'express';

// Feedback value constants
const FEEDBACK_POSITIVE = 1;
const FEEDBACK_NEGATIVE = -1;

/**
 * DTO for submitting user feedback.
 */
interface SubmitFeedbackDto {
  feedback: number;
}

/**
 * Response DTO for feedback submission.
 */
interface SubmitFeedbackResponse {
  success: boolean;
  message: string;
}

/**
 * REST controller for debate-related endpoints.
 * Provides endpoints for user feedback and downloading debate JSON files.
 */
@Controller('api/debates')
export class DebateController {
  private stateManager: StateManager;

  constructor() {
    this.stateManager = new StateManager();
  }

  

  /**
   * Submits user feedback for a completed debate.
   * 
   * @param id - The debate ID.
   * @param dto - The feedback data containing feedback value (1 for positive, -1 for negative).
   * @returns Success response.
   * @throws {BadRequestException} If feedback value is invalid (not 1 or -1).
   * @throws {NotFoundException} If debate is not found.
   */
  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(@Param('id') id: string, @Body() dto: SubmitFeedbackDto): Promise<SubmitFeedbackResponse> {
    // Validate feedback value
    if (dto.feedback !== FEEDBACK_POSITIVE && dto.feedback !== FEEDBACK_NEGATIVE) {
      throw new BadRequestException(`Feedback must be ${FEEDBACK_POSITIVE} (positive) or ${FEEDBACK_NEGATIVE} (negative)`);
    }

    try {
      await this.stateManager.updateUserFeedback(id, dto.feedback);
      return { success: true, message: 'Feedback submitted successfully' };
    } catch (error: unknown) {
      this.handleStateManagerError(error, id);
    }
  }

  /**
   * Downloads the complete debate JSON file.
   * 
   * @param id - The debate ID.
   * @param res - Express response object (with passthrough to maintain NestJS compatibility).
   * @returns JSON file download.
   * @throws {NotFoundException} If debate is not found.
   */
  @Get(':id/download')
  async downloadDebate( @Param('id') id: string, @Res({ passthrough: true }) res: Response ): Promise<DebateState> {
    try {
      const debate = await this.stateManager.getDebate(id);
      if (!debate) {
        throw new NotFoundException(`Debate ${id} not found`);
      }

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${id}.json"`);
      
      // Return the data (NestJS will handle the response)
      return debate;
    } catch (error: unknown) {
      this.handleStateManagerError(error, id);
    }
  }

  /**
   * Handles errors from StateManager operations, converting "not found" errors
   * to NotFoundException while preserving other error types.
   * 
   * @param error - The error caught from StateManager operation.
   * @param debateId - The debate ID for error message.
   * @throws {NotFoundException} If the error indicates debate not found.
   * @throws The original error if it's not a "not found" error.
   */
  private handleStateManagerError(error: unknown, debateId: string): never {
    if (error instanceof NotFoundException) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      throw new NotFoundException(`Debate ${debateId} not found`);
    }
    throw error;
  }
}

