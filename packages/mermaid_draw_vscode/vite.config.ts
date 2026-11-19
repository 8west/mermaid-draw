import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

const outDir = fileURLToPath(new URL('./dist/webview', import.meta.url));

/** Ship Excalidraw's fonts with the webview; the page points `EXCALIDRAW_ASSET_PATH` at them. */
function copyExcalidrawFonts(): Plugin {
  return {
    name: 'mermaid-draw:copy-excalidraw-fonts',
    apply: 'build',
    writeBundle() {
      // Excalidraw is a dependency of the shared canvas in the web package.
      const require = createRequire(fileURLToPath(new URL('../mermaid_draw_web/package.json', import.meta.url)));
      const fonts = resolve(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
      cpSync(fonts, resolve(outDir, 'fonts'), { recursive: true });
    },
  };
}

/**
 * Excalidraw lists an esm.sh CDN copy after `EXCALIDRAW_ASSET_PATH` in every font `src`, which the
 * webview CSP rejects (one console error per font). Point that fallback at the shipped fonts instead.
 */
function localExcalidrawFontFallback(): Plugin {
  const start = 'https://esm.sh/';
  const end = '/dist/prod/';
  return {
    name: 'mermaid-draw:local-excalidraw-font-fallback',
    apply: 'build',
    transform(code, id) {
      if (!/[\\/]@excalidraw[\\/]excalidraw[\\/]/.test(id)) return null;
      const from = code.indexOf(start);
      if (from < 0) return null;
      const to = code.indexOf(end, from);
      if (to < 0) this.error('Unrecognised Excalidraw font fallback URL');
      const local = '${typeof window.EXCALIDRAW_ASSET_PATH=="string"?window.EXCALIDRAW_ASSET_PATH.replace(/\\/*$/,""):location.origin}/';
      return { code: code.slice(0, from) + local + code.slice(to + end.length), map: null };
    },
  };
}

/** Builds the webview page script. The extension host is built by `vite.extension.config.ts`. */
export default defineConfig({
  base: './',
  plugins: [vue(), localExcalidrawFontFallback(), copyExcalidrawFonts()],
  resolve: { dedupe: ['vue', 'react', 'react-dom'] },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8_000,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/webview/main.ts', import.meta.url)),
      output: {
        entryFileNames: 'webview.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => asset.names.some((name) => name.endsWith('.css')) ? 'webview.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
