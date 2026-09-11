<script setup>
import { getDocument } from 'pdfjs-dist';
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
} from 'vue';

import { loadSourceBytes } from '../loadSourceBytes.js';
import { ensurePdfWorker } from '../pdf/pdfjsWorker.js';
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

const observeAllPages = () => {
  observer = new IntersectionObserver(
    (entries) => {
      const next = new Set(activeIndexes.value);

      entries.forEach((entry) => {
        const index = Number(entry.target.dataset.pageIndex);
        if (entry.isIntersecting) next.add(index);
        else next.delete(index);
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
