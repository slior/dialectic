import { DEBATE_EVENTS, DebateEvent, createEvent } from './events';

describe('events', () => {
  describe('DEBATE_EVENTS', () => {
    it('should contain all expected event constants', () => {
      expect(DEBATE_EVENTS.START).toBe('START');
      expect(DEBATE_EVENTS.COMPLETE).toBe('COMPLETE');
      expect(DEBATE_EVENTS.FAILED).toBe('FAILED');
      expect(DEBATE_EVENTS.QUESTIONS_PENDING).toBe('QUESTIONS_PENDING');
      expect(DEBATE_EVENTS.ALL_CLEAR).toBe('ALL_CLEAR');
      expect(DEBATE_EVENTS.BEGIN_ROUND).toBe('BEGIN_ROUND');
      expect(DEBATE_EVENTS.CONTEXTS_READY).toBe('CONTEXTS_READY');
      expect(DEBATE_EVENTS.PROPOSALS_COMPLETE).toBe('PROPOSALS_COMPLETE');
      expect(DEBATE_EVENTS.CRITIQUES_COMPLETE).toBe('CRITIQUES_COMPLETE');
      expect(DEBATE_EVENTS.REFINEMENTS_COMPLETE).toBe('REFINEMENTS_COMPLETE');
      expect(DEBATE_EVENTS.CONTINUE).toBe('CONTINUE');
      expect(DEBATE_EVENTS.CONSENSUS_REACHED).toBe('CONSENSUS_REACHED');
      expect(DEBATE_EVENTS.MAX_ROUNDS_REACHED).toBe('MAX_ROUNDS_REACHED');
      expect(DEBATE_EVENTS.RETRY).toBe('RETRY');
      expect(DEBATE_EVENTS.FALLBACK).toBe('FALLBACK');
    });
  });

  describe('createEvent', () => {
    it('should create an event with the correct type', () => {
      const event = createEvent('START');
      expect(event.type).toBe('START');
    });

    it('should create an event with a timestamp', () => {
      const before = new Date();
      const event = createEvent('START');
      const after = new Date();
      
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should create an event with optional payload', () => {
      const payload = { roundNumber: 1, confidenceScore: 85 };
      const event = createEvent('CONSENSUS_REACHED', payload);
      
      expect(event.payload).toEqual(payload);
    });

    it('should create an event without payload when not provided', () => {
      const event = createEvent('START');
      expect(event.payload).toBeUndefined();
    });

    it('should support all event types', () => {
      const eventTypes: Array<keyof typeof DEBATE_EVENTS> = [
        'START',
        'COMPLETE',
        'FAILED',
        'QUESTIONS_PENDING',
        'ALL_CLEAR',
        'BEGIN_ROUND',
        'CONTEXTS_READY',
        'PROPOSALS_COMPLETE',
        'CRITIQUES_COMPLETE',
        'REFINEMENTS_COMPLETE',
        'CONTINUE',
        'CONSENSUS_REACHED',
        'MAX_ROUNDS_REACHED',
        'RETRY',
        'FALLBACK',
      ];

      eventTypes.forEach((type) => {
        const event = createEvent(type);
        expect(event.type).toBe(type);
        expect(event).toHaveProperty('timestamp');
      });
    });
  });

  describe('DebateEvent type safety', () => {
    it('should enforce type safety for event types', () => {
      const event: DebateEvent = {
        type: 'START',
        timestamp: new Date(),
      };
      
      expect(event.type).toBe('START');
    });

    it('should allow payload with any structure', () => {
      const event: DebateEvent = {
        type: 'CONSENSUS_REACHED',
        payload: {
          confidenceScore: 85,
          roundNumber: 3,
          customField: 'value',
        },
        timestamp: new Date(),
      };
      
      expect(event.payload?.confidenceScore).toBe(85);
      expect(event.payload?.customField).toBe('value');
    });
  });
});
