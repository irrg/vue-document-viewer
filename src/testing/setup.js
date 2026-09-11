// jsdom doesn't implement the Blob-URL APIs; components that build a
// download link from raw bytes need a stand-in to run under Vitest.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url';
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}

// jsdom doesn't implement scrollIntoView at all.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
