import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

function inlineExcalidrawFonts(): Plugin {
  return {
    name: 'mermaid-draw:inline-excalidraw-fonts',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/@excalidraw\/excalidraw\/dist\/prod\/[^/]+\.js$/.test(id)) return;

      // Excalidraw accepts data URLs; relative font strings would fall back to its CDN.
      const embedded = code.replace(/(["'])(\.\/fonts\/[\w/-]+\.woff2)\1/g, (_, _quote, font: string) => {
        const path = resolve(dirname(id), font);
        this.addWatchFile(path);
        return JSON.stringify(`data:font/woff2;base64,${readFileSync(path).toString('base64')}`);
      });
      if (embedded !== code) return { code: embedded, map: null };
    },
  };
}

const licensePath = 'third-party-licenses.md';

function inlineBuildNotices(): Plugin {
  return {
    name: 'mermaid-draw:inline-build-notices',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const html = bundle['index.html'];
        const notices = bundle[licensePath];
        if (html?.type !== 'asset' || typeof html.source !== 'string'
          || notices?.type !== 'asset' || typeof notices.source !== 'string') {
          this.error("Expected index.html and Vite's third-party license report.");
        }
        const escaped = notices.source.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
        const withNotices = html.source.replace(/<\/body>(\s*<\/html>\s*)$/i, (_, closing: string) =>
          `<template id="third-party-licenses"><pre>${escaped}</pre></template>\n</body>${closing}`);
        if (withNotices === html.source) this.error('Could not embed notices in index.html.');
        html.source = withNotices;
        delete bundle[licensePath];
        const extra = Object.keys(bundle).filter((name) => name !== 'index.html');
        if (extra.length) this.error(`Standalone build emitted extra files: ${extra.join(', ')}`);
      },
    },
  };
}

export default defineConfig({
  build: { license: { fileName: licensePath } },
  plugins: [vue(), inlineExcalidrawFonts(), viteSingleFile(), inlineBuildNotices()],
});
