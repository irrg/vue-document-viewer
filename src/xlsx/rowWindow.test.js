import { describe, expect, it } from 'vitest';

import { buildRowOffsets, computeVisibleRowRange } from './rowWindow.js';

describe('buildRowOffsets', () => {
  it('returns cumulative tops plus a final total-height entry', () => {
    const rows = [{ heightPx: 20 }, { heightPx: 30 }, { heightPx: 10 }];
    expect(buildRowOffsets(rows)).toEqual([0, 20, 50, 60]);
  });

  it('handles an empty sheet', () => {
    expect(buildRowOffsets([])).toEqual([0]);
  });
});

describe('computeVisibleRowRange', () => {
  const uniformRows = Array.from({ length: 100 }, () => ({ heightPx: 20 }));
  const offsets = buildRowOffsets(uniformRows);

  it('returns a range covering the viewport at scrollTop 0', () => {
    const { start, end } = computeVisibleRowRange(offsets, 0, 100);
    expect(start).toBe(0);
    // 100px viewport / 20px rows = 5 rows fully visible, plus row 5 whose
    // top sits exactly on the viewport's bottom edge — included on purpose,
    // since a virtualizer should round boundary rows in rather than risk a
    // gap from float error in a real (non-round) viewport height.
    expect(end).toBe(6);
  });

  it('shifts the range as scrollTop increases', () => {
    const { start, end } = computeVisibleRowRange(offsets, 500, 100);
    expect(start).toBe(25); // row 25 starts at 500px
    expect(end).toBe(31);
  });

  it('extends the range by the buffer on both sides', () => {
    const { start, end } = computeVisibleRowRange(offsets, 500, 100, 40);
    // buffer 40px = 2 rows of slack on each side
    expect(start).toBe(23);
    expect(end).toBe(33);
  });

  it('clamps the buffered start to 0 near the top', () => {
    const { start } = computeVisibleRowRange(offsets, 10, 100, 200);
    expect(start).toBe(0);
  });

  it('clamps the end to the row count near the bottom', () => {
    const { end } = computeVisibleRowRange(offsets, 1900, 100, 200);
    expect(end).toBe(100);
  });

  it('never returns an empty range for a non-empty sheet', () => {
    const { start, end } = computeVisibleRowRange(offsets, 0, 0);
    expect(end).toBeGreaterThan(start);
  });

  it('returns an empty range for an empty sheet', () => {
    expect(computeVisibleRowRange([0], 0, 100)).toEqual({ start: 0, end: 0 });
  });

  it('handles variable row heights correctly, not just uniform ones', () => {
    const variableRows = [
      { heightPx: 10 },
      { heightPx: 100 },
      { heightPx: 10 },
      { heightPx: 10 },
    ];
    const variableOffsets = buildRowOffsets(variableRows);
    // row 0: 0-10, row 1: 10-110, row 2: 110-120, row 3: 120-130
    const { start, end } = computeVisibleRowRange(variableOffsets, 50, 20);
    expect(start).toBe(1); // the tall row 1 covers [10,110), containing 50
    expect(end).toBe(2); // viewport 50-70 is still within row 1
  });
});
