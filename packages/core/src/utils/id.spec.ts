import { formatTimestampForTraceName, generateDebateId } from './id';

describe('id utilities', () => {
  describe('formatTimestampForTraceName', () => {
    it('should format a date to YYYYMMDD-hhmm format', () => {
      // Use local time constructor: new Date(year, monthIndex, day, hour, minute)
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240115-1430');
    });

    it('should pad single-digit months with leading zero', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toMatch(/^202401/);
    });

    it('should pad single-digit days with leading zero', () => {
      const date = new Date(2024, 0, 5, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toMatch(/^20240105-/);
    });

    it('should pad single-digit hours with leading zero', () => {
      const date = new Date(2024, 0, 15, 5, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toMatch(/-0530$/);
    });

    it('should pad single-digit minutes with leading zero', () => {
      const date = new Date(2024, 0, 15, 14, 5);
      const result = formatTimestampForTraceName(date);
      expect(result).toMatch(/-1405$/);
    });

    it('should handle midnight (00:00)', () => {
      const date = new Date(2024, 0, 15, 0, 0);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240115-0000');
    });

    it('should handle end of day (23:59)', () => {
      const date = new Date(2024, 0, 15, 23, 59);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240115-2359');
    });

    it('should handle first day of month', () => {
      const date = new Date(2024, 0, 1, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240101-1430');
    });

    it('should handle last day of month', () => {
      const date = new Date(2024, 0, 31, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240131-1430');
    });

    it('should handle February 29 in leap year', () => {
      const date = new Date(2024, 1, 29, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240229-1430');
    });

    it('should handle December', () => {
      const date = new Date(2024, 11, 15, 14, 30);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20241215-1430');
    });

    it('should handle year boundaries', () => {
      const date = new Date(2023, 11, 31, 23, 59);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20231231-2359');
    });

    it('should handle year 2000', () => {
      const date = new Date(2000, 0, 1, 0, 0);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20000101-0000');
    });

    it('should handle future years', () => {
      const date = new Date(2099, 11, 31, 23, 59);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20991231-2359');
    });

    it('should produce consistent format for same date', () => {
      const date = new Date(2024, 5, 15, 10, 30);
      const result1 = formatTimestampForTraceName(date);
      const result2 = formatTimestampForTraceName(date);
      expect(result1).toBe(result2);
      expect(result1).toBe('20240615-1030');
    });

    it('should handle all single-digit values', () => {
      const date = new Date(2024, 0, 1, 0, 0);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20240101-0000');
    });

    it('should handle all double-digit values', () => {
      const date = new Date(2024, 11, 31, 23, 59);
      const result = formatTimestampForTraceName(date);
      expect(result).toBe('20241231-2359');
    });
  });

  describe('generateDebateId', () => {
    it('should generate a debate ID with correct format when date is provided', () => {
      // Use local time constructor: new Date(year, monthIndex, day, hour, minute, second)
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      
      // Format: deb-YYYYMMDD-HHMMSS-rand
      expect(result).toMatch(/^deb-20240115-143045-[a-z0-9]{4}$/);
    });

    it('should generate a debate ID with correct format when no date is provided', () => {
      const result = generateDebateId();
      
      // Format: deb-YYYYMMDD-HHMMSS-rand
      expect(result).toMatch(/^deb-\d{8}-\d{6}-[a-z0-9]{4}$/);
    });

    it('should include "deb-" prefix', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-/);
    });

    it('should include timestamp in YYYYMMDD-HHMMSS format', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-143045-/);
    });

    it('should include random 4-character suffix', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      const parts = result.split('-');
      expect(parts[3]).toMatch(/^[a-z0-9]{4}$/);
    });

    it('should pad single-digit months with leading zero', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-202401/);
    });

    it('should pad single-digit days with leading zero', () => {
      const date = new Date(2024, 0, 5, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240105-/);
    });

    it('should pad single-digit hours with leading zero', () => {
      const date = new Date(2024, 0, 15, 5, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-053045-/);
    });

    it('should pad single-digit minutes with leading zero', () => {
      const date = new Date(2024, 0, 15, 14, 5, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-140545-/);
    });

    it('should pad single-digit seconds with leading zero', () => {
      const date = new Date(2024, 0, 15, 14, 30, 5);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-143005-/);
    });

    it('should handle midnight (00:00:00)', () => {
      const date = new Date(2024, 0, 15, 0, 0, 0);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-000000-/);
    });

    it('should handle end of day (23:59:59)', () => {
      const date = new Date(2024, 0, 15, 23, 59, 59);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240115-235959-/);
    });

    it('should generate unique IDs for same timestamp', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const id1 = generateDebateId(date);
      const id2 = generateDebateId(date);
      
      // Should have same timestamp but different random suffix
      expect(id1).not.toBe(id2);
      expect(id1.substring(0, 20)).toBe(id2.substring(0, 20)); // Same prefix
      expect(id1.substring(21)).not.toBe(id2.substring(21)); // Different suffix
    });

    it('should generate different IDs for different timestamps', () => {
      const date1 = new Date(2024, 0, 15, 14, 30, 45);
      const date2 = new Date(2024, 0, 15, 14, 30, 46);
      const id1 = generateDebateId(date1);
      const id2 = generateDebateId(date2);
      
      expect(id1).not.toBe(id2);
    });

    it('should handle first day of month', () => {
      const date = new Date(2024, 0, 1, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240101-/);
    });

    it('should handle last day of month', () => {
      const date = new Date(2024, 0, 31, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240131-/);
    });

    it('should handle February 29 in leap year', () => {
      const date = new Date(2024, 1, 29, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240229-/);
    });

    it('should handle December', () => {
      const date = new Date(2024, 11, 15, 14, 30, 45);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20241215-/);
    });

    it('should handle year boundaries', () => {
      const date = new Date(2023, 11, 31, 23, 59, 59);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20231231-235959-/);
    });

    it('should handle year 2000', () => {
      const date = new Date(2000, 0, 1, 0, 0, 0);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20000101-000000-/);
    });

    it('should handle future years', () => {
      const date = new Date(2099, 11, 31, 23, 59, 59);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20991231-235959-/);
    });

    it('should generate IDs with correct length', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = generateDebateId(date);
      // Format: deb-YYYYMMDD-HHMMSS-rand (4 chars)
      // deb- = 4, YYYYMMDD = 8, - = 1, HHMMSS = 6, - = 1, rand = 4
      // Total: 4 + 8 + 1 + 6 + 1 + 4 = 24
      expect(result.length).toBe(24);
    });

    it('should use current time when no date is provided', () => {
      const before = new Date();
      const result = generateDebateId();
      const after = new Date();
      
      // Extract timestamp from result
      const match = result.match(/^deb-(\d{8})-(\d{6})-/);
      expect(match).not.toBeNull();
      
      if (match && match[1] && match[2]) {
        const year = parseInt(match[1].substring(0, 4), 10);
        const month = parseInt(match[1].substring(4, 6), 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[1].substring(6, 8), 10);
        const hour = parseInt(match[2].substring(0, 2), 10);
        const minute = parseInt(match[2].substring(2, 4), 10);
        const second = parseInt(match[2].substring(4, 6), 10);
        
        const resultDate = new Date(year, month, day, hour, minute, second);
        
        // Should be within the time window
        expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
        expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      }
    });

    it('should generate multiple unique IDs when called without date', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDebateId());
      }
      // With random suffix, should have high uniqueness
      // Even with same timestamp, random suffix should make most unique
      expect(ids.size).toBeGreaterThan(1);
    });

    it('should handle all single-digit date/time components', () => {
      const date = new Date(2024, 0, 1, 0, 0, 0);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20240101-000000-/);
    });

    it('should handle all double-digit date/time components', () => {
      const date = new Date(2024, 11, 31, 23, 59, 59);
      const result = generateDebateId(date);
      expect(result).toMatch(/^deb-20241231-235959-/);
    });
  });
});
