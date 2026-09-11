import { createApp, defineComponent, h, ref } from 'vue';

import { PdfViewer, XlsxViewer } from '../index.js';

const App = defineComponent({
  setup() {
    const mode = ref('pdf');

    const pdfSrc = ref('./sample.pdf');
    const scale = ref(1.25);
    const pdfStatus = ref('loading…');
    const viewerRef = ref(null);
    // Handy for poking at the exposed search API from the devtools console.
    window.viewerRefForDebugging = viewerRef;
    const query = ref('');
    const searchStatus = ref('');

    const xlsxSrc = ref('./sample-rich.xlsx');
    const xlsxStatus = ref('loading…');

    const onPdfFileChange = (event) => {
      const [file] = event.target.files;
      if (file) pdfSrc.value = file;
    };

    const onXlsxFileChange = (event) => {
      const [file] = event.target.files;
      if (file) xlsxSrc.value = file;
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

    const modeButton = (value, label) =>
      h(
        'button',
        {
          onClick: () => {
            mode.value = value;
          },
          style: { fontWeight: mode.value === value ? 'bold' : 'normal' },
        },
        label,
      );

    const renderPdfHeader = () => [
      h('input', { type: 'file', accept: '.pdf', onChange: onPdfFileChange }),
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
      h('span', pdfStatus.value),
    ];

    const renderXlsxHeader = () => [
      h('input', { type: 'file', accept: '.xlsx', onChange: onXlsxFileChange }),
      h('span', xlsxStatus.value),
    ];

    return () =>
      h('div', { style: { height: '100%' } }, [
        h('header', [
          modeButton('pdf', 'PDF'),
          modeButton('xlsx', 'XLSX'),
          ...(mode.value === 'pdf' ? renderPdfHeader() : renderXlsxHeader()),
        ]),
        h('div', { id: 'viewer' }, [
          mode.value === 'pdf'
            ? h(PdfViewer, {
                ref: viewerRef,
                key:
                  pdfSrc.value instanceof File
                    ? pdfSrc.value.name
                    : pdfSrc.value,
                src: pdfSrc.value,
                scale: scale.value,
                onRendered: () => {
                  pdfStatus.value = 'rendered';
                },
                onError: (error) => {
                  pdfStatus.value = `error: ${error.message}`;
                },
              })
            : h(XlsxViewer, {
                key:
                  xlsxSrc.value instanceof File
                    ? xlsxSrc.value.name
                    : xlsxSrc.value,
                src: xlsxSrc.value,
                onRendered: () => {
                  xlsxStatus.value = 'rendered';
                },
                onError: (error) => {
                  xlsxStatus.value = `error: ${error.message}`;
                },
                onSheetChange: ({ name }) => {
                  xlsxStatus.value = `sheet: ${name}`;
                },
              }),
        ]),
      ]);
  },
});

createApp(App).mount('#app');
