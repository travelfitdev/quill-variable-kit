import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // target 降到 ES2018：产物里去掉 `?.`/`??`（ES2020），webpack 4 的解析器（acorn 6）
    // 才能直接解析，消费方无需把 quill-variable-kit 也加进 babel-loader 的 include。
    // quill 2 本身仍是 ESM + class fields，webpack 4 下必须转译，那是消费方绕不开的。
    target: 'es2018',
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs'),
      cssFileName: 'style',
    },
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      // quill 是 peer 依赖，vite 不会像 dependencies 那样自动外部化，必须显式声明，
      // 否则会被打进 dist：体积膨胀且宿主版本无法生效。
      // 这里不再列 'parchment'：它已不作为依赖声明，源码只从 quill 取（见 core/variable/blot.ts）。
      external: ['quill'],
    },
  },
});
