/**
 * Row-virtualization math for XlsxViewer, kept separate from the component
 * so it's unit-testable without mounting anything. Rows have variable
 * heights, so "which rows are visible" needs a cumulative-offset lookup,
 * not a simple divide-by-average-height guess.
 */

/**
 * @param {{heightPx: number}[]} rows
 * @returns {number[]} offsets[i] is the top of row i in px; offsets[length]
 * is the sheet's total rendered height.
 */
export const buildRowOffsets = (rows) => {
  const offsets = new Array(rows.length + 1);
  offsets[0] = 0;

  for (let i = 0; i < rows.length; i += 1) {
    offsets[i + 1] = offsets[i] + rows[i].heightPx;
  }

  return offsets;
};

// Largest row index whose top offset is <= targetPx.
const findRowAtOffset = (offsets, targetPx) => {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= targetPx) low = mid;
    else high = mid - 1;
  }

  return low;
};

/**
 * @param {number[]} offsets - from buildRowOffsets.
 * @param {number} scrollTop
 * @param {number} viewportHeightPx
 * @param {number} [bufferPx] - extra px rendered above/below the viewport,
 * so a small scroll doesn't show a blank flash.
 * @returns {{start: number, end: number}} half-open row index range to render.
 */
export const computeVisibleRowRange = (
  offsets,
  scrollTop,
  viewportHeightPx,
  bufferPx = 0,
) => {
  const rowCount = offsets.length - 1;
  if (rowCount <= 0) return { start: 0, end: 0 };

  const startPx = Math.max(0, scrollTop - bufferPx);
  const endPx = scrollTop + viewportHeightPx + bufferPx;

  const start = findRowAtOffset(offsets, startPx);
  const end = Math.min(findRowAtOffset(offsets, endPx) + 1, rowCount);

  return { start, end: Math.max(end, start + 1) };
};
