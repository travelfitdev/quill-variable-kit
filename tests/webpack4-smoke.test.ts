import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import webpack from 'webpack';

// webpack 4 冒烟：验证 dist 的两种产物（index.mjs / index.cjs）能被 webpack 4 直接解析打包。
// 只检查「能否解析 + 解析到哪个入口」，不执行产物，因此用桩 quill 顶掉真实的 quill——
// quill 2 只发 ESM 且带 class fields，webpack 4 本来就解析不了，让消费方转译那是消费方的职责。
//
// 为什么这里要 skip 守卫：verify 里 `test` 跑在 `build` 之前，全新检出时还没有 dist；
// 专门的 `test:webpack4` 步骤排在 build 之后、会确定性跑到这里。本地已有 dist 时默认 `test`
// 也会顺带跑一次，属预期。
// 为什么用 process.cwd() 而不是 import.meta.url：vitest 会改写模块的 import.meta，
// 它不再是 file:// 协议（new URL 会抛「scheme must be file」）。仓库脚本始终从根目录
// 调用 vitest，cwd 即包根。
const root = process.cwd();
const hasDist =
  existsSync(join(root, 'dist/index.mjs')) && existsSync(join(root, 'dist/index.cjs'));

const compile = (config: webpack.Configuration) =>
  new Promise<void>((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (!stats || stats.hasErrors()) {
        reject(new Error(stats?.toString('errors-only') ?? 'webpack 4 冒烟失败，未输出编译统计。'));
        return;
      }
      resolve();
    });
  });

describe.skipIf(!hasDist)('webpack4 产物兼容', () => {
  it('esm 与 cjs 产物都能在 webpack 4 下解析打包', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'qvk-wp4-'));
    try {
      const modules = join(tmp, 'node_modules');
      const quillDir = join(modules, 'quill');
      await mkdir(quillDir, { recursive: true });
      await writeFile(
        join(quillDir, 'package.json'),
        JSON.stringify({ name: 'quill', main: './stub.js' }),
      );
      // quill 2 只发 ESM，stub 也得是 ESM（默认 + 命名导出），webpack 4 才能对上 named import。
      await writeFile(
        join(quillDir, 'stub.js'),
        'export const Quill = class {};\nexport const Parchment = { EmbedBlot: class {} };\nexport class Delta {}\nexport default Quill;\n',
      );
      await symlink(root, join(modules, 'quill-variable-kit'), 'dir');
      await writeFile(join(tmp, 'entry.js'), "require('quill-variable-kit');\n");

      const cases: { label: string; config: webpack.Configuration }[] = [
        {
          label: 'esm（web 目标走 module 字段 → index.mjs）',
          config: {
            mode: 'development',
            context: tmp,
            entry: './entry.js',
            output: { path: join(tmp, 'out'), filename: 'web.js' },
            resolve: { alias: { quill: join(quillDir, 'stub.js') } },
          },
        },
        {
          label: 'cjs（node 目标走 main 字段 → index.cjs）',
          config: {
            mode: 'development',
            context: tmp,
            entry: './entry.js',
            output: { path: join(tmp, 'out'), filename: 'node.js' },
            resolve: { alias: { quill: join(quillDir, 'stub.js') } },
            target: 'node',
          },
        },
      ];

      for (const { label, config } of cases) {
        await expect(compile(config)).resolves.toBeUndefined();
        console.log(`[quill-variable-kit] webpack4 冒烟通过：${label}`);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
