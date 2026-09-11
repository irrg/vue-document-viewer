<script setup>
import { TextLayer } from 'pdfjs-dist';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
} from 'vue';

const props = defineProps({
  page: { type: Object, required: true },
  scale: { type: Number, required: true },
  active: { type: Boolean, required: true },
});

const emit = defineEmits(['rendered', 'error']);

const canvasEl = useTemplateRef('canvasEl');
const textLayerEl = useTemplateRef('textLayerEl');
const failed = ref(false);

const viewport = computed(() => props.page.getViewport({ scale: props.scale }));

let renderTask = null;
let textLayer = null;

const cancelRender = () => {
  renderTask?.cancel();
  renderTask = null;
  textLayer?.cancel();
  textLayer = null;
};

const render = async () => {
  failed.value = false;

  const currentViewport = viewport.value;
  const canvas = canvasEl.value;
  const context = canvas.getContext('2d');
  const outputScale = window.devicePixelRatio || 1;

  canvas.width = Math.floor(currentViewport.width * outputScale);
  canvas.height = Math.floor(currentViewport.height * outputScale);
  canvas.style.width = `${Math.floor(currentViewport.width)}px`;
  canvas.style.height = `${Math.floor(currentViewport.height)}px`;

  const transform =
    outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];

  renderTask = props.page.render({
    canvasContext: context,
    transform,
    viewport: currentViewport,
  });

  try {
    await renderTask.promise;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;
    failed.value = true;
    emit('error', error);
    return;
  } finally {
    renderTask = null;
  }

  // TextLayer only ever appends — on a re-render (a scale change while
  // already active) the previous scale's spans would otherwise stay behind,
  // stale and overlapping the new ones, corrupting selection and find.
  textLayerEl.value.replaceChildren();

  textLayer = new TextLayer({
    textContentSource: props.page.streamTextContent(),
    container: textLayerEl.value,
    viewport: currentViewport,
  });
  // The container's calc()-based auto-sizing depends on --total-scale-factor
  // machinery from pdf.js's full PDFPageView, which we don't use — size it
  // directly instead, matching the canvas's own CSS size exactly.
  textLayerEl.value.style.width = `${Math.floor(currentViewport.width)}px`;
  textLayerEl.value.style.height = `${Math.floor(currentViewport.height)}px`;

  try {
    await textLayer.render();
  } catch {
    // The canvas already has pixels on screen; a text-layer failure only
    // costs selection/search on this page, not the page itself.
  }

  emit('rendered');
};

watch(
  () => props.active,
  (isActive) => {
    if (isActive) nextTick(render);
    else cancelRender();
  },
  { immediate: true },
);

watch(
  () => props.scale,
  () => {
    if (!props.active) return;
    cancelRender();
    nextTick(render);
  },
);

onBeforeUnmount(cancelRender);
</script>

<template>
  <div
    class="pdf-page"
    :style="{
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
      '--total-scale-factor': scale,
    }"
  >
    <template v-if="active">
      <canvas v-show="!failed" ref="canvasEl" class="pdf-page__canvas" />
      <div ref="textLayerEl" class="pdf-page__text-layer" />
      <p v-if="failed" class="pdf-page__error">
        This page couldn't be rendered.
      </p>
    </template>
  </div>
</template>

<style scoped>
.pdf-page {
  position: relative;
}

.pdf-page__canvas {
  display: block;
}

.pdf-page__error {
  margin: 0;
  padding: 1rem;
}

.pdf-page__text-layer {
  position: absolute;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-align: initial;
  letter-spacing: normal;
  word-spacing: normal;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;

  --min-font-size-inv: calc(1 / var(--min-font-size, 1));
  --text-scale-factor: calc(
    var(--total-scale-factor) * var(--min-font-size, 1)
  );
}

.pdf-page__text-layer :deep(span),
.pdf-page__text-layer :deep(br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
}

.pdf-page__text-layer :deep(> span:not(.markedContent)),
.pdf-page__text-layer :deep(.markedContent span:not(.markedContent)) {
  --font-height: 0;
  --scale-x: 1;
  --rotate: 0deg;

  font-size: calc(var(--text-scale-factor) * var(--font-height));
  transform: rotate(var(--rotate)) scaleX(var(--scale-x))
    scale(var(--min-font-size-inv));
}

.pdf-page__text-layer :deep(.markedContent) {
  display: contents;
}

.pdf-page__text-layer :deep(.endOfContent) {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  cursor: default;
  user-select: none;
}

.pdf-page__text-layer ::selection {
  background: color-mix(in srgb, AccentColor, transparent 50%);
  color: transparent;
}
</style>
