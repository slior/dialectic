import { round2 } from '../types/eval.types';

/**
 * Validates that a value is a finite number and returns it, or undefined if invalid.
 * 
 * @param {unknown} x - The value to validate as a number.
 * @returns {number | undefined} The number if valid and finite, otherwise undefined.
 */
export function numOrUndefined(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

/**
 * Calculates the average of an array of numbers.
 * 
 * @param {number[]} values - An array of numbers to average.
 * @returns {number | null} The average rounded to 2 decimal places, or null if the array is empty.
 */
export function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return round2(sum / values.length);
}

