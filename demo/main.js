import { createApp, defineComponent, h, ref } from 'vue';

import { FlPdfViewer } from '../index.js';

const App = defineComponent({
  setup() {
    const src = ref('./sample.pdf');
    const scale = ref(1.25);
    const status = ref('loading…');

    const onFileChange = (event) => {
      const [file] = event.target.files;
      if (file) src.value = file;
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
          h('span', status.value),
        ]),
        h('div', { id: 'viewer' }, [
          h(FlPdfViewer, {
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
