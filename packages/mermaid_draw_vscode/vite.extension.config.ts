import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Builds the extension host entry as CommonJS, which VS Code loads with `vscode` provided at runtime. */
export default defineConfig({
  build: {
    ssr: fileURLToPath(new URL('./src/extension/extension.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist/extension', import.meta.url)),
    emptyOutDir: true,
    target: 'node20',
    sourcemap: true,
    rollupOptions: {
      external: ['vscode'],
      output: { format: 'cjs', entryFileNames: 'extension.cjs' },
    },
  },
});
