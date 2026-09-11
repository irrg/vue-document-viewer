import { createApp, defineComponent, h, ref } from 'vue';

import { PdfViewer } from '../index.js';

const App = defineComponent({
  setup() {
    const src = ref('./sample.pdf');
    const scale = ref(1.25);
    const status = ref('loading…');
    const viewerRef = ref(null);
    // Handy for poking at the exposed search API from the devtools console.
    window.viewerRefForDebugging = viewerRef;
    const query = ref('');
    const searchStatus = ref('');

    const onFileChange = (event) => {
      const [file] = event.target.files;
      if (file) src.value = file;
    };

    const describe = (result) => {
      if (!result || result.total === 0) return 'no matches';
      if (!result.found) return 'not found';

      return `page ${result.pageIndex + 1} · match ${result.position} of ${result.total} pages`;
    };

    const runSearch = async () => {
      if (!query.value) {
        viewerRef.value?.clearSearch();
        searchStatus.value = '';
        return;
      }

      searchStatus.value = describe(await viewerRef.value?.search(query.value));
    };

    const goNext = async () => {
      searchStatus.value = describe(await viewerRef.value?.findNext());
    };

    const goPrevious = async () => {
      searchStatus.value = describe(await viewerRef.value?.findPrevious());
    };

    const onSearchKeydown = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (event.shiftKey) goPrevious();
      else if (searchStatus.value) goNext();
      else runSearch();
    };

    return () =>
      h('div', { style: { height: '100%' } }, [
        h('header', [
          h('input', { type: 'file', accept: '.pdf', onChange: onFileChange }),
          h(
            'button',
            {
              onClick: () => {
                scale.value = Math.max(0.25, scale.value - 0.25);
              },
            },
            '−',
          ),
          h('span', `${Math.round(scale.value * 100)}%`),
          h(
            'button',
            {
              onClick: () => {
                scale.value += 0.25;
              },
            },
            '+',
          ),
          h('input', {
            type: 'search',
            placeholder: 'Find in document…',
            value: query.value,
            onInput: (event) => {
              query.value = event.target.value;
              searchStatus.value = '';
            },
            onKeydown: onSearchKeydown,
          }),
          h('button', { onClick: runSearch }, 'Find'),
          h('button', { onClick: goPrevious }, '↑'),
          h('button', { onClick: goNext }, '↓'),
          h('span', searchStatus.value),
          h('span', status.value),
        ]),
        h('div', { id: 'viewer' }, [
          h(PdfViewer, {
            ref: viewerRef,
            key: src.value instanceof File ? src.value.name : src.value,
            src: src.value,
            scale: scale.value,
            onRendered: () => {
              status.value = 'rendered';
            },
            onError: (error) => {
              status.value = `error: ${error.message}`;
            },
          }),
        ]),
      ]);
  },
});

createApp(App).mount('#app');
