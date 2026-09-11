import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { DocumentFormat } from '../detectFormat.js';

import FlFallbackPreview from './FlFallbackPreview.vue';

describe('FlFallbackPreview', () => {
  it('names the file when a fileName is given', () => {
    const wrapper = mount(FlFallbackPreview, {
      props: { format: DocumentFormat.Rtf, fileName: 'notes.rtf' },
    });

    expect(wrapper.text()).toContain('notes.rtf');
  });

  it('falls back to a format label when no fileName is given', () => {
    const wrapper = mount(FlFallbackPreview, {
      props: { format: DocumentFormat.LegacyOle },
    });

    expect(wrapper.text()).toContain('legacy Office document');
  });

  it('emits rendered, and never error', () => {
    const wrapper = mount(FlFallbackPreview, {
      props: { format: DocumentFormat.Unknown },
    });

    expect(wrapper.emitted('rendered')).toHaveLength(1);
    expect(wrapper.emitted('error')).toBeUndefined();
  });

  it('links a string src directly for download', () => {
    const wrapper = mount(FlFallbackPreview, {
      props: {
        format: DocumentFormat.Pptx,
        src: 'https://example.com/deck.pptx',
      },
    });

    expect(wrapper.get('a').attributes('href')).toBe(
      'https://example.com/deck.pptx',
    );
  });

  it('wraps binary src in an object URL for download', async () => {
    const wrapper = mount(FlFallbackPreview, {
      props: { format: DocumentFormat.Pptx, src: new Uint8Array([1, 2, 3]) },
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.get('a').attributes('href')).toMatch(/^blob:/);
  });

  it('renders no download link when no src is given', () => {
    const wrapper = mount(FlFallbackPreview, {
      props: { format: DocumentFormat.Unknown },
    });

    expect(wrapper.find('a').exists()).toBe(false);
  });
});
