<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { DocumentFormat } from '../detectFormat.js';

const FORMAT_LABELS = {
  [DocumentFormat.Pptx]: 'PowerPoint presentation',
  [DocumentFormat.LegacyOle]: 'legacy Office document',
  [DocumentFormat.Rtf]: 'Rich Text document',
  [DocumentFormat.Unknown]: 'file',
};

const props = defineProps({
  format: { type: String, required: true },
  fileName: { type: String, default: null },
  src: { type: [ArrayBuffer, Uint8Array, Blob, String], default: null },
});

const emit = defineEmits(['rendered']);

const objectUrl = ref(null);

const formatLabel = computed(
  () => FORMAT_LABELS[props.format] ?? FORMAT_LABELS[DocumentFormat.Unknown],
);

const downloadHref = computed(() =>
  typeof props.src === 'string' ? props.src : objectUrl.value,
);

onMounted(() => {
  if (props.src && typeof props.src !== 'string') {
    const blob = props.src instanceof Blob ? props.src : new Blob([props.src]);

    objectUrl.value = URL.createObjectURL(blob);
  }

  emit('rendered');
});

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div class="fl-fallback-preview">
    <p class="fl-fallback-preview__message">
      Preview isn't available for
      {{ fileName ? `“${fileName}”` : `this ${formatLabel}` }}.
    </p>
    <a
      v-if="downloadHref"
      class="fl-fallback-preview__download"
      :href="downloadHref"
      :download="fileName || undefined"
      >Download</a
    >
  </div>
</template>

<style scoped>
.fl-fallback-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 1rem;
}
</style>
