<script setup>
import { getDocument } from 'pdfjs-dist';
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';

import { loadSourceBytes } from '../loadSourceBytes.js';
import { ensurePdfWorker } from '../pdf/pdfjsWorker.js';
import { createPdfSearch } from '../pdf/pdfSearch.js';
import PdfPage from './PdfPage.vue';

const props = defineProps({
  src: { type: [ArrayBuffer, Uint8Array, Blob, String], required: true },
  fetcher: { type: Function, default: undefined },
  fileName: { type: String, default: null },
  scale: { type: Number, default: 1 },
});

const emit = defineEmits(['rendered', 'error']);

const containerEl = useTemplateRef('containerEl');
const pages = shallowRef([]);
const activeIndexes = shallowRef(new Set());
const pageEls = new Map();

let pdfDocument = null;
let observer = null;

// A page a little outside the viewport is kept rendered so scrolling never
// shows a blank flash, but far-off pages still release their canvas.
const ROOT_MARGIN = '600px 0px';

const setPageEl = (el, index) => {
  if (el) pageEls.set(index, el);
  else pageEls.delete(index);
};

// Chromium sometimes paints a freshly-rendered canvas to its backing store
// without compositing it to screen when that happens inside a scrollable
// container — the pixels are correct (confirmed via getImageData) but stay
// invisible until a real scroll delta occurs. A 1px nudge and back forces
// that recomposite without any visible movement.
const nudgeRepaint = () => {
  const container = containerEl.value;
  if (!container) return;

  const { scrollTop } = container;
  container.scrollTop = scrollTop + 1;
  container.scrollTop = scrollTop;
};

// Pages known to have a *complete* render right now — cleared when a page
// goes inactive, since it'll need a fresh one next time it activates. Text
// streams into the DOM incrementally, so "active" alone doesn't mean a
// page's text is all there yet; search needs this stronger guarantee.
const renderedIndexes = new Set();
// One-shot waiters for a specific page's next completed render, resolved by
// onPageRendered below.
const renderWaiters = new Map();

const onPageRendered = (index) => {
  renderedIndexes.add(index);
  nudgeRepaint();
  renderWaiters.get(index)?.();
  renderWaiters.delete(index);
};

const waitForPageRendered = (index, timeoutMs = 3000) =>
  new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, timeoutMs);

    renderWaiters.set(index, () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });

const observeAllPages = () => {
  observer = new IntersectionObserver(
    (entries) => {
      const next = new Set(activeIndexes.value);

      entries.forEach((entry) => {
        const index = Number(entry.target.dataset.pageIndex);
        if (entry.isIntersecting) {
          next.add(index);
        } else {
          next.delete(index);
          renderedIndexes.delete(index);
        }
      });

      activeIndexes.value = next;
    },
    { root: containerEl.value, rootMargin: ROOT_MARGIN },
  );

  pageEls.forEach((el) => observer.observe(el));
};

onMounted(async () => {
  ensurePdfWorker();

  try {
    const bytes = await loadSourceBytes(props.src, props.fetcher);

    pdfDocument = await getDocument({ data: bytes }).promise;
    pages.value = await Promise.all(
      Array.from({ length: pdfDocument.numPages }, (_, i) =>
        pdfDocument.getPage(i + 1),
      ),
    );

    await nextTick();
    observeAllPages();
    emit('rendered');
  } catch (error) {
    emit('error', error);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  pdfDocument?.destroy();
});

const pdfSearch = createPdfSearch({
  getPages: () => pages.value,
  getPageEl: (index) => pageEls.get(index),
  isPageRendered: (index) => renderedIndexes.has(index),
  waitForPageRendered,
  isPageActive: (index) => activeIndexes.value.has(index),
  markPageStale: (index) => renderedIndexes.delete(index),
});

watch(() => props.scale, pdfSearch.reanchorCurrentMatch);

defineExpose({
  search: pdfSearch.search,
  findNext: pdfSearch.findNext,
  findPrevious: pdfSearch.findPrevious,
  clearSearch: pdfSearch.clearSearch,
});
</script>

<template>
  <div ref="containerEl" class="fl-pdf-viewer">
    <PdfPage
      v-for="(page, index) in pages"
      :key="index"
      :ref="(el) => setPageEl(el?.$el, index)"
      :data-page-index="index"
      :page="page"
      :scale="scale"
      :active="activeIndexes.has(index)"
      @rendered="onPageRendered(index)"
    />
  </div>
</template>

<style scoped>
/* Fills whatever box the consumer gives it — set a height on an ancestor. */
.fl-pdf-viewer {
  position: relative;
  height: 100%;
  overflow-y: auto;
}
</style>
