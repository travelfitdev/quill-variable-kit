import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs'),
      cssFileName: 'style',
    },
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      // quill / parchment 是 peer 依赖，vite 不会像 dependencies 那样自动外部化，必须显式声明，
      // 否则会被打进 dist：体积膨胀且宿主版本无法生效。
      external: ['quill', 'parchment'],
    },
  },
});
