import { describe, expect, it } from 'vitest';

import { formatCellValue } from './numberFormats.js';

// Mirrors what formatCellValue itself calls, so assertions hold regardless
// of which locale the test runner's ICU data defaults to — we're verifying
// our own token-detection/options-building logic, not pinning one locale's
// exact separators or field order.
const expectedNumber = (value, options) =>
  new Intl.NumberFormat(undefined, options).format(value);
const expectedDate = (value, options) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(
    value,
  );

describe('formatCellValue', () => {
  it('renders null/undefined as an empty string', () => {
    expect(formatCellValue(null, '0.00')).toBe('');
    expect(formatCellValue(undefined, '0.00')).toBe('');
  });

  it('never throws and never renders [object Object]', () => {
    expect(formatCellValue({ weird: true }, '0.00%')).not.toContain(
      'object Object',
    );
    expect(() => formatCellValue(Symbol('x'), 'mm/dd/yyyy')).not.toThrow();
  });

  it('passes strings through unchanged', () => {
    expect(formatCellValue('hello', '@')).toBe('hello');
  });

  it('stringifies a number with no format code or "General"', () => {
    expect(formatCellValue(1234.5, undefined)).toBe('1234.5');
    expect(formatCellValue(1234.5, 'General')).toBe('1234.5');
  });

  describe('percentages', () => {
    it('scales by 100 and appends %, honoring the decimal count', () => {
      expect(formatCellValue(0.4567, '0.00%')).toBe(
        `${expectedNumber(45.67, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
      );
    });

    it('supports whole-number percentages', () => {
      expect(formatCellValue(0.5, '0%')).toBe(
        `${expectedNumber(50, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%`,
      );
    });
  });

  describe('thousands separators and fixed decimals', () => {
    it('groups thousands and fixes two decimal places', () => {
      expect(formatCellValue(1234.5, '#,##0.00')).toBe(
        expectedNumber(1234.5, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: true,
        }),
      );
    });

    it('does not group when the format code has no comma', () => {
      expect(formatCellValue(1234.5, '0.00')).toBe(
        expectedNumber(1234.5, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        }),
      );
    });
  });

  describe('currency', () => {
    it('prefixes a bare $ code', () => {
      expect(formatCellValue(5, '$#,##0.00')).toBe(
        `$${expectedNumber(5, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })}`,
      );
    });

    it('extracts the symbol from a locale-currency bracket', () => {
      expect(formatCellValue(1234.5, '[$$-409]#,##0.00')).toBe(
        `$${expectedNumber(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })}`,
      );
    });

    it('supports non-dollar currency symbols from the bracket form', () => {
      expect(formatCellValue(10, '[$€-407]#,##0.00')).toBe(
        `€${expectedNumber(10, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })}`,
      );
    });
  });

  describe('multi-section format codes', () => {
    it('uses only the first (positive) section', () => {
      // "0.00;[Red]-0.00" — the negative section is out of scope; a
      // positive value should just use the first section's formatting.
      expect(formatCellValue(5, '0.00;[Red]-0.00')).toBe(
        expectedNumber(5, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
    });
  });

  describe('dates and times', () => {
    const date = new Date(Date.UTC(2024, 2, 15, 13, 5, 9)); // 2024-03-15 13:05:09 UTC

    it('renders a date-only format with no time fields', () => {
      const result = formatCellValue(date, 'mm/dd/yyyy');
      expect(result).toBe(
        expectedDate(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
      );
    });

    it('renders a time-only format with no date fields', () => {
      const result = formatCellValue(date, 'hh:mm:ss');
      expect(result).toBe(
        expectedDate(date, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    });

    it('disambiguates month vs. minute "m" tokens in a combined format', () => {
      const result = formatCellValue(date, 'yyyy-mm-dd hh:mm:ss');
      expect(result).toBe(
        expectedDate(date, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    });

    it('treats a lone "m" as month when there is no adjacent time token', () => {
      const result = formatCellValue(date, 'mm/yyyy');
      expect(result).toBe(
        expectedDate(date, { month: '2-digit', year: 'numeric' }),
      );
    });

    it('renders a long month name for "mmmm"', () => {
      const result = formatCellValue(date, 'mmmm d, yyyy');
      expect(result).toBe(
        expectedDate(date, { month: 'long', day: 'numeric', year: 'numeric' }),
      );
    });

    it('does not shift the day for a timezone west of UTC', () => {
      // Midnight UTC is still "the day before" in any UTC-negative zone —
      // if we ever start formatting in the local timezone instead of UTC,
      // this is the test that would catch the regression.
      const midnightUtc = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
      const result = formatCellValue(midnightUtc, 'yyyy-mm-dd');
      expect(result).toBe(
        expectedDate(midnightUtc, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
      );
      expect(result).toContain('2024');
      expect(result).not.toContain('2023');
    });

    it('falls back to a sensible default when no format code is given', () => {
      expect(() => formatCellValue(date, undefined)).not.toThrow();
      expect(formatCellValue(date, undefined)).toContain('2024');
    });
  });
});
