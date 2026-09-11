<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';

import { DocumentFormat } from '../detectFormat.js';
import { loadSourceBytes } from '../loadSourceBytes.js';
import { getWorkbookParser } from '../parserRegistry.js';
import { buildRowOffsets, computeVisibleRowRange } from '../xlsx/rowWindow.js';

const props = defineProps({
  src: { type: [ArrayBuffer, Uint8Array, Blob, String], required: true },
  fetcher: { type: Function, default: undefined },
  fileName: { type: String, default: null },
  // A very large sheet (real uploads are unpredictable) shouldn't lock the
  // tab trying to lay out a million rows — cap it and say so, rather than
  // silently truncating or hanging.
  rowCap: { type: Number, default: 2000 },
});

const emit = defineEmits(['rendered', 'error', 'sheet-change']);

const scrollEl = useTemplateRef('scrollEl');
const workbook = shallowRef(null);
const activeSheetIndex = ref(0);
const scrollTop = ref(0);
const viewportHeightPx = ref(0);
const imageUrlCache = new Map();

// Rendered a little past the viewport so a small scroll never shows a
// blank flash before the next frame's row range catches up.
const ROW_BUFFER_PX = 400;

const activeSheet = computed(
  () => workbook.value?.sheets[activeSheetIndex.value] ?? null,
);
const isRowCapped = computed(
  () => (activeSheet.value?.rows.length ?? 0) > props.rowCap,
);
const rows = computed(
  () => activeSheet.value?.rows.slice(0, props.rowCap) ?? [],
);

// Hidden rows take no layout space, so the scroll math needs to see 0 here
// even though the row itself still carries its real heightPx for when/if
// it's ever shown.
const rowOffsets = computed(() =>
  buildRowOffsets(
    rows.value.map((row) => ({ heightPx: row.hidden ? 0 : row.heightPx })),
  ),
);

const frozenRowCount = computed(() => activeSheet.value?.frozen.rows ?? 0);
const frozenColCount = computed(() => activeSheet.value?.frozen.cols ?? 0);

const visibleRowRange = computed(() => {
  const { start, end } = computeVisibleRowRange(
    rowOffsets.value,
    scrollTop.value,
    viewportHeightPx.value,
    ROW_BUFFER_PX,
  );

  // Frozen rows are always rendered (they're sticky-pinned regardless of
  // scroll), so the window has to include them even if scrolled past.
  return { start: Math.min(start, frozenRowCount.value), end };
});

const visibleRowIndexes = computed(() => {
  const { start, end } = visibleRowRange.value;
  const indexes = [];

  for (let i = start; i < end; i += 1) indexes.push(i);

  return indexes;
});

const topSpacerPx = computed(
  () => rowOffsets.value[visibleRowRange.value.start] ?? 0,
);
const bottomSpacerPx = computed(() => {
  const total = rowOffsets.value[rowOffsets.value.length - 1] ?? 0;
  return Math.max(
    0,
    total - (rowOffsets.value[visibleRowRange.value.end] ?? total),
  );
});

const columnOffsets = computed(() => {
  const columns = activeSheet.value?.columns ?? [];
  const offsets = [0];

  columns.forEach((col) =>
    offsets.push(offsets[offsets.length - 1] + col.widthPx),
  );

  return offsets;
});

// Anchor-cell address -> {rowSpan, colSpan}; a Set of every address a merge
// covers, so those cells render nothing (per spec: anchor only).
const mergeInfo = computed(() => {
  const anchors = new Map();
  const covered = new Set();

  (activeSheet.value?.merges ?? []).forEach((merge) => {
    anchors.set(`${merge.row},${merge.col}`, merge);

    for (let r = merge.row; r < merge.row + merge.rowSpan; r += 1) {
      for (let c = merge.col; c < merge.col + merge.colSpan; c += 1) {
        if (r !== merge.row || c !== merge.col) covered.add(`${r},${c}`);
      }
    }
  });

  return { anchors, covered };
});

const imagesByAnchorRow = computed(() => {
  const map = new Map();

  (activeSheet.value?.images ?? []).forEach((image) => {
    const list = map.get(image.anchor.row) ?? [];
    list.push(image);
    map.set(image.anchor.row, list);
  });

  return map;
});

const imageUrl = (blob) => {
  let url = imageUrlCache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    imageUrlCache.set(blob, url);
  }

  return url;
};

const borderCss = (side) => {
  if (!side) return undefined;

  const style =
    side.style === 'thick' || side.style === 'medium' ? 'solid' : side.style;

  return `1px ${style} ${side.color}`;
};

const cellStyle = (styleId) => {
  const style = workbook.value?.styles[styleId];
  if (!style) return {};

  return {
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: [
      style.underline && 'underline',
      style.strike && 'line-through',
    ]
      .filter(Boolean)
      .join(' '),
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSizePx}px`,
    color: style.color,
    backgroundColor: style.backgroundColor || undefined,
    textAlign: style.align,
    verticalAlign: style.valign,
    whiteSpace: style.wrap ? 'pre-wrap' : 'nowrap',
    borderTop: borderCss(style.borders.top),
    borderRight: borderCss(style.borders.right),
    borderBottom: borderCss(style.borders.bottom),
    borderLeft: borderCss(style.borders.left),
  };
};

const onScroll = () => {
  if (scrollEl.value) scrollTop.value = scrollEl.value.scrollTop;
};

let resizeObserver;

const observeViewport = () => {
  if (!scrollEl.value) return;

  viewportHeightPx.value = scrollEl.value.clientHeight;
  resizeObserver = new ResizeObserver(() => {
    viewportHeightPx.value = scrollEl.value.clientHeight;
  });
  resizeObserver.observe(scrollEl.value);
};

const selectSheet = (index) => {
  if (index === activeSheetIndex.value) return;

  activeSheetIndex.value = index;
  scrollTop.value = 0;
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0;
  });
  emit('sheet-change', { index, name: workbook.value?.sheets[index]?.name });
};

onMounted(async () => {
  try {
    const bytes = await loadSourceBytes(props.src, props.fetcher);
    const loader = getWorkbookParser(DocumentFormat.Xlsx);

    if (!loader) throw new Error('No workbook parser registered for xlsx.');

    const { parse } = await loader();
    workbook.value = await parse(bytes);

    await nextTick();
    observeViewport();
    emit('rendered');
  } catch (error) {
    emit('error', error);
  }
});

watch(activeSheetIndex, () => nextTick(observeViewport));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  imageUrlCache.forEach((url) => URL.revokeObjectURL(url));
});
</script>

<template>
  <div class="xlsx-viewer">
    <div
      v-if="workbook && workbook.sheets.length > 1"
      class="xlsx-viewer__tabs"
      role="tablist"
    >
      <button
        v-for="(sheet, index) in workbook.sheets"
        :key="sheet.name"
        type="button"
        role="tab"
        class="xlsx-viewer__tab"
        :aria-selected="index === activeSheetIndex"
        :class="{ 'xlsx-viewer__tab--active': index === activeSheetIndex }"
        @click="selectSheet(index)"
      >
        {{ sheet.name }}
      </button>
    </div>

    <div
      v-if="activeSheet"
      ref="scrollEl"
      class="xlsx-viewer__scroll"
      @scroll="onScroll"
    >
      <table
        class="xlsx-viewer__table"
        :style="{ width: `${columnOffsets[columnOffsets.length - 1]}px` }"
      >
        <colgroup>
          <col
            v-for="(col, index) in activeSheet.columns"
            :key="index"
            :style="{ width: `${col.hidden ? 0 : col.widthPx}px` }"
          />
        </colgroup>
        <tbody>
          <tr v-if="topSpacerPx > 0" aria-hidden="true">
            <td
              :style="{
                height: `${topSpacerPx}px`,
                padding: 0,
                border: 'none',
              }"
            />
          </tr>

          <tr
            v-for="rowIndex in visibleRowIndexes"
            v-show="!rows[rowIndex].hidden"
            :key="rowIndex"
            :style="{
              height: `${rows[rowIndex].heightPx}px`,
              position: rowIndex < frozenRowCount ? 'sticky' : undefined,
              top:
                rowIndex < frozenRowCount
                  ? `${rowOffsets[rowIndex]}px`
                  : undefined,
              zIndex: rowIndex < frozenRowCount ? 2 : undefined,
            }"
          >
            <template
              v-for="(cell, colIndex) in rows[rowIndex].cells"
              :key="colIndex"
            >
              <td
                v-if="
                  !mergeInfo.covered.has(`${rowIndex},${colIndex}`) &&
                  !activeSheet.columns[colIndex]?.hidden
                "
                class="xlsx-viewer__cell"
                :rowspan="
                  mergeInfo.anchors.get(`${rowIndex},${colIndex}`)?.rowSpan
                "
                :colspan="
                  mergeInfo.anchors.get(`${rowIndex},${colIndex}`)?.colSpan
                "
                :style="{
                  ...cellStyle(cell.styleId),
                  position: colIndex < frozenColCount ? 'sticky' : undefined,
                  left:
                    colIndex < frozenColCount
                      ? `${columnOffsets[colIndex]}px`
                      : undefined,
                  zIndex: colIndex < frozenColCount ? 1 : undefined,
                }"
              >
                {{ cell.text }}
                <template v-if="imagesByAnchorRow.has(rowIndex)">
                  <img
                    v-for="(image, i) in imagesByAnchorRow
                      .get(rowIndex)
                      .filter((img) => img.anchor.col === colIndex)"
                    :key="i"
                    class="xlsx-viewer__image"
                    :src="imageUrl(image.blob)"
                    alt=""
                    :style="{
                      left: `${image.offsetPx.x}px`,
                      top: `${image.offsetPx.y}px`,
                      width: `${image.widthPx}px`,
                      height: `${image.heightPx}px`,
                    }"
                  />
                </template>
              </td>
            </template>
          </tr>

          <tr v-if="bottomSpacerPx > 0" aria-hidden="true">
            <td
              :style="{
                height: `${bottomSpacerPx}px`,
                padding: 0,
                border: 'none',
              }"
            />
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="isRowCapped" class="xlsx-viewer__cap-notice">
      Showing the first {{ rowCap.toLocaleString() }} of
      {{ activeSheet.rows.length.toLocaleString() }} rows.
    </p>
  </div>
</template>

<style scoped>
.xlsx-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.xlsx-viewer__tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid #ccc;
  flex: none;
}

.xlsx-viewer__tab {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  white-space: nowrap;
}

.xlsx-viewer__tab--active {
  border-bottom: 2px solid currentcolor;
  font-weight: bold;
}

.xlsx-viewer__scroll {
  flex: 1;
  overflow: auto;
  position: relative;
}

.xlsx-viewer__table {
  border-collapse: collapse;
  table-layout: fixed;
}

.xlsx-viewer__cell {
  position: relative;
  overflow: hidden;
  padding: 2px 4px;
  box-sizing: border-box;
  background-color: Canvas;
}

.xlsx-viewer__image {
  position: absolute;
  pointer-events: none;
}

.xlsx-viewer__cap-notice {
  flex: none;
  margin: 0;
  padding: 0.5rem 1rem;
  border-top: 1px solid #ccc;
  font-size: 0.875rem;
}
</style>
