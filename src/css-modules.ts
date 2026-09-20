// 必须是一个 `.ts` 文件（而不是 `env.d.ts`），`tsc -p tsconfig.build.json` 才会把它
// 原样 emit 成 `dist/css-modules.d.ts` 随包发布：`dist/index.d.ts` 里有
// `import 'quill/dist/quill.core.css'` 与 `import './style.css'` 两个副作用导入，
// 关闭 `skipLibCheck` 的消费者会因缺少 `*.css` 模块声明而对它们报 TS2307。
// `declare module '*.css'` 是通配声明，任何以 `.css` 结尾的导入都命中。
declare module '*.css';
