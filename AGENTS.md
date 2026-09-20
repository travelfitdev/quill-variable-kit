# AGENTS.md

给编码代理的项目说明。只写从代码里核实过的内容；与本文件冲突时，以实际代码和 `package.json` 为准。

面向人类贡献者的协作流程（环境准备、分支与 PR、label 对照、代码风格）在 `CONTRIBUTING.md`，两边不重复：**这里讲「代码怎么组织、为什么这么设计」，那里讲「怎么参与」**。发布流程留在本文件（维护者动作，不进 CONTRIBUTING）。

## 项目概览

`quill-variable-kit` 是一个基于 Quill 2 的轻量、框架无关的富文本编辑器封装，内置变量、单行模式和字数限制。对外只暴露一个 `createEditor(options)` 工厂和几个类型，内部按能力拆成 `core/` 下的模块，由 `EditorFacade` 直接组装与调用。

- 包管理器：pnpm（`packageManager: pnpm@12.3.4`），Node >= 20（CI 用 24）
- 模块类型：ESM（`"type": "module"`）
- 运行依赖（peer，宿主应用自行安装；本地开发由 devDependencies 兜底）：`quill@^2.0.3`、`parchment@^3.0.0`
- 构建产物：`dist/`（`vite build` 产出 ESM+CJS，`tsc -p tsconfig.build.json` 产出 `.d.ts`）

## 常用命令

```bash
pnpm install
pnpm run check         # tsc --noEmit
pnpm run lint          # oxlint（含类型感知，见「代码风格」）
pnpm run format        # prettier --write .
pnpm run format:check  # prettier --check .（只检查不改）
pnpm run test          # vitest run（单次）
pnpm run test:watch    # vitest 监听
pnpm run build         # vite build + 生成 .d.ts
pnpm run example:build # 构建 Vue 示例到 dist-example/（相对路径，可直接托管 GitHub Pages；verify 在 main 上通过后由 deploy-example.yml 部署）
pnpm run verify        # CI 门禁：format:check + lint + check + test + build + example:build + pack:check
pnpm run release:patch # 发版：验证 -> 改小版本 -> commit + tag -> 暂存（见「发布流程」）
```

改动完成前跑 `pnpm run verify`。`.github/workflows/verify.yml` 在 PR 和 main 推送时跑的就是它。

## 提交规范

- 提交信息遵循 Conventional Commits：`<type>(<scope>): <subject>`，`subject` 用中文、说明「为什么」而非「做了什么」。
- `type` 在 `feat / fix / refactor / docs / style / test / chore / build / ci / perf / revert` 里选；`scope` 可选，小到能力模块（如 `variable`、`single-line`），`examples` / `docs` 等在模块内的小修可不带。
- 破坏性变更在 `type` 后加 `!`，或写 `BREAKING CHANGE` footer。当前版本策略见「发布流程」的兼容性说明，0.1.0 阶段一般不涉及。
- 格式由 commitlint 强约束：`git commit` 时经 husky 的 `commit-msg` 钩子跑 `pnpm exec commitlint --edit`，不合规直接拦下。**不要用 `--no-verify` 绕过**；`commitlint.config.js` 基于 `@commitlint/config-conventional`。
- `git push` 时经 husky 的 `pre-push` 钩子跑 `pnpm run verify`，验证不过就推不上去（本地热缓存下约 3 秒）。只推 tag 时跳过：发版流程里 `preversion` 已经验证过同一个提交，而手动打 tag 那条路本就只靠 CI 门禁。
- 发布流程的版本提交不走人工：`npm version` 按 `.npmrc` 的 `message=chore(release): v%s` 自动生成合规信息并打 tag（见下）；`commitlint.config.js` 里的 `ignores` 兜底放行裸版本号（万一有人覆盖了该配置，发布不会因此挂掉）。
- 一个提交只做一件事；提交前跑 `pnpm run verify`。

## 发布流程

发版入口是 `pnpm run release:patch|minor|major`（即 `npm version` 的一层包装），一条命令跑完从验证到暂存：

1. `preversion` 先跑 `pnpm run verify`，验证不过即中断，不会发版。
2. 改 `package.json` 版本号并自动生成 commit（`chore(release): vX.Y.Z`）+ 打 tag `vX.Y.Z`。
3. `postversion` 推 main 与 tag，`.github/workflows/publish.yml` 在 `v<数字>*` tag 推送时触发，按信任边界拆成三个 job：

   - **build**（`contents: read`，无任何凭证）：校验 tag 与 `package.json` 版本一致 → `pnpm run verify`（含 build，`dist/` 是 gitignore 的，产物只在这里产生）→ `pnpm pack` 出 tarball 并上传 artifact。
   - **publish**（只有 `id-token: write`）：`npm stage publish ./quill-variable-kit.tgz`，用 npm trusted publishing（OIDC）换一次性 registry token，仓库里**不存** `NPM_TOKEN`。
   - **release**（只有 `contents: write`）：`gh release create --draft --generate-notes` 建草稿 Release。

   拆开的原因是：装依赖、跑项目脚本的 `build` 是最不可信的一环，绝不能和发布凭证同处一个 job；`publish` 因此不 install、不 checkout 源码，只对 tarball 操作。**发布对象是 tarball 而不是目录**这点也很关键——npm 只对目录发布触发 `prepublishOnly`，所以持有凭证的 job 不会执行任何项目脚本（再叠一层 `--ignore-scripts`）。`prepublishOnly` 仍要保留，它护的是本地手动 `npm publish` 那条路。**不要在 `publish` job 的 `setup-node` 里配 `registry-url`**：一配它就会写一个指向 `${NODE_AUTH_TOKEN}` 的 `.npmrc`，而仓库没有这个 secret，token 落成占位符 `XXXXX-...`；npm 只要看到 token 就优先拿去鉴权、不会退回 OIDC，`npm stage publish` 会报 E401（`v0.1.2` 那次失败就是它）。不配则 npm 用默认 registry.npmjs.org，并在没有 token 配置时自动走 trusted publishing（OIDC）。

触发面只有 tag：`publish.yml` 没有 `workflow_dispatch`，推分支 / 提 PR 都不触发。也就是说**手动** `git push origin vX.Y.Z`（或网页上打 tag）同样会发版，但那条路绕过本地的 `preversion` 预检，那时唯一的门禁就是 CI 里 `build` job 跑的那次 `verify`。tag 过滤写成 `v[0-9]*` 只挡掉 `v-next` 这类名字（`*` 仍能匹配字母，`v1-test` 会触发，再由版本一致性校验拦下）。

**发布走暂存（staged publishing），不直接上线**：npm 上新版本对外可见前，必须由维护者带 2FA 批准——在 npmjs.com 的 Staged Packages 里点 Approve，或本地 `npm stage approve <version>`。批准前可 `npm stage reject` 撤掉，所以自动部分（push tag / 暂存）都可撤销，真正不可逆的是带 2FA 的批准动作。CI 建的 GitHub Release 同样是草稿，批准暂存版本时一并发布它，把「上线」收敛成一个人工动作。

重试与撤销：

- `build` job 失败（版本校验或 verify 没过）时**什么都没暂存**，修好后重跑 workflow 或删 tag 重推即可；tag 已经推上去了，不用重新发版。
- 版本已经进了暂存区还想重来，必须先 `npm stage reject <version>`，否则同版本再次暂存会因版本已存在而报错。
- 不批准也能检查暂存内容：`npm stage list` / `npm stage view <id>` / `npm stage download <id>`。
- `release` job 失败只影响 GitHub Release，暂存结果不受影响；重跑 workflow 即可，草稿 Release 不存在时不会冲突（已存在会报错，先删草稿再重跑）。

前置条件（脚本替代不了，需人工先配好）：

- 工作区必须干净：改 bug / 加功能后**先 commit**，再跑 `release:*`，否则 `npm version` 直接报错。
- Git 仓库必须有 `origin` 远程。
- 在 npm 上配好 trusted publisher，CI 才能用 OIDC 换 token（**不再需要 `NPM_TOKEN` secret，可以删掉**）：
  ```bash
  npm trust github quill-variable-kit \
    --repo travelfitdev/quill-variable-kit \
    --file publish.yml \
    --allow-stage-publish
  ```
  注意三点：`--allow-stage-publish` 与 `--allow-publish` 是**两个独立权限**，只配后者会允许直发而挡住 `npm stage publish`，这里要的是前者；`--file` 填的是 workflow **文件名**，重命名 `publish.yml` 会让授权失效；trust 配置需要 2FA（浏览器授权），`v0.1.2` 那次 CI 失败正是因为它没配上——`--loglevel http` 下能看到 `POST /-/npm/v1/oidc/token/exchange/package/...` 返回 404。若将来一个包有多条 trust，npm 也支持（2026-09 起），查改走 `npm trust list` / `npm trust revoke --id <id>`。
- npm 账号必须开 2FA：批准动作必须有它。
- **首版例外（已过去）**：包必须已存在于 npm 才允许暂存。`0.1.0` 从未发布，实际的首发是手动 `npm publish` 直发的 `0.1.1`（registry 上目前只有这一个版本）；包已存在，`0.1.2` 起都走暂存。
- 版本号改动前确认；发布产物只有 `dist/`、`README.md`、`LICENSE`（`package.json` 的 `files`）。

单测执行示例：`pnpm exec vitest run tests/editor.test.ts`。

## 代码结构

```
src/
  index.ts               公开入口：注册 css、导出 createEditor 与类型
  css-modules.ts         仅含 `declare module '*.css'`，由 index.ts 副作用导入，随构建 emit 进 dist 供发布类型自包含
  types.ts               公开类型：EditorOptions / EditorInstance / Variable / VariableUsage
  core/                  编辑器外壳与内建能力
    create.ts            EditorFacade：把能力装到 Quill 上、转发公共 API、管字数节点与剪贴板
    editor.ts            InternalEditor = 继承 Quill 的空类，导入时完成内置 blot 注册
    single-line.ts       单行模式：installSingleLine + stripNewlines（样式在外壳 style.css 里）
    warn.ts              统一的 console.warn 出口（含 PREFIX 与 formatTokens 辅助）
    variable/
      index.ts           VariableBinding：识别、计数、插入、读取、复制导出
      blot.ts            VariableBlot（数据形状）+ normalizeVariable + registerVariableBlot
      tokens.ts          匹配串匹配、字数统计、变量统计、复制导出的纯函数
      style.css          变量样式，由 index.ts import
  env.d.ts               *.vue 模块声明（仅示例需要）
  style.css              外壳、字数节点，以及覆盖外壳布局的模式样式
examples/                Vue 3 示例（两个 demo：单行 / 普通）
tests/                   Vitest + jsdom
```

样式归属看规则的性质：**自洽、只描述自己产生的元素**的能力样式跟能力同目录，由能力入口 import（`core/variable/style.css` 由 `core/variable/index.ts`）；**覆盖外壳布局**的规则留在 `src/style.css`——单行模式那几条改的正是上面的 `.ql-editor` padding 与 `--editor-padding-*` 变量，拆开会导致两个文件都读不通。构建产物始终合并为单个 `dist/style.css`，发布形态与用法不变。

### 能力机制

能力不是插件，也没有注册表和契约层：每个能力是 `core/` 下的一个模块，`EditorFacade` 在构造时直接组装、之后直接调用（`installSingleLine(...)`、`this.variable?.xxx()`）。

- **有数据形状的能力用目录**（`core/variable/`：blot / 纯函数 / 绑定分开），**纯行为约束用单文件**（`core/single-line.ts`）。
- **不要为了"以后可能有多个"提前抽接口层**：facade 直接引用具体能力最省事也最好读；等真的出现第二个同类能力、重复模式稳定了，再抽接缝。
- 顺序是结构保证：core 约束（`EditorFacade.sanitizeText`）固定排在能力转换之前，所以"先清换行、再转换变量"不依赖任何数组顺序。
- 粘贴改写只有 `EditorFacade.patchClipboard` 一处：不要在能力里再 patch 一次 `clipboard.convert`，两个来源会让顺序取决于包装嵌套。
- 需要新增 blot 时才在 `InternalEditor`（`src/core/editor.ts`）上注册，不要直接注册到 `quill` 默认导出，否则 `createEditor` 创建的实例找不到它。

## 需要遵守的不变量

**变量数据形状。** `VariableBlot`（`src/core/variable/blot.ts`）把 `{ token, label }` 写入 `dataset.token` / `dataset.label`，并通过 `VariableBlot.value(node)` 从这两个属性读回。`label` 缺省等于 `token` 这条规则集中在同文件的 `normalizeVariable`，`create` / `value` 与 token 匹配都走它，所以两侧不会各写一份默认值。历史 Delta 里保存的也是这个对象形状，改字段名属于破坏性变更。

**识别规则（token vs label）。**

| 路径 | 识别 / 输出 |
| --- | --- |
| `setText` / 初始文本 | 只识别 `token` |
| 粘贴纯文本 | 只识别 `label` |
| 复制 / 剪切导出 | 输出 `label` |
| 从编辑器内部复制后粘贴 | 靠 HTML 里的 `data-token` 经 blot matcher 还原，不走匹配串匹配 |
| 跨编辑器粘贴（`token` 在目标未配置） | 降级为源 `label` 纯文本，并参与一次目标的 `label` 匹配 |
| `getText()` | 输出 `token` |
| `getVariables()` | 读 Delta 里的 embed 统计，按首次出现顺序聚合 `token`，`label` 取文档中的值 |
| 字数统计 | 只扣除 `token` 与换行，`label` 照常计数 |

`label` 是**展示文本**，不是配置项以外的自由参数——不要给它加"逐次覆盖"的入口。它在粘贴路径上同时充当匹配串，这是有意设计（人写的文本要能重识别），不要拆成两个字段。

`token` 是匹配串而不是纯粹标识符：定界符（`{{}}`、`##`）是语法的一部分，会被**逐字**匹配，所以 `replaceMatches` 里长匹配串优先，避免短串先吃掉长串前缀。同一个值既做匹配又做身份（跨编辑器校验、`getVariables` 聚合、字数扣除都用它），这是当前的取舍；要拆成 `name` + `token` 需先引入定界符配置，尚未做。

**跨编辑器粘贴校验。** HTML 里的 `data-token` 是**源编辑器**的 token，目标可能不认识。`normalizePastedEmbeds`（`tokens.ts`）在 `transformPastedDelta` 里做一次校验：token 在目标配置中存在就按**目标**的 label 重建 embed（同一 token 两处 label 可能不同），不存在就降级成源 label 的纯文本。降级产物必须**紧接着**参与 `replaceByLabel`，否则它在目标里永远得不到重新识别——所以顺序固定为 `replaceByLabel(normalizePastedEmbeds(delta))`，反过来会让降级产物漏掉匹配。不校验的后果不是"看起来别扭"而是数据错误：未知 token 扣不掉字数（`getContentLength` 拿目标 token 做 `replaceAll`），`getText()` 还会把陌生 token 交给业务方。

**`insertVariable`。** 只接受已配置的 `token`；未配置时用 `warn()` 输出警告并直接返回，不修改文档。展示文本只来自配置的 `label`（`normalizeVariable(configured)`）。校验必须放在 `getSelection` / `deleteText` 之前，否则一次非法调用会吞掉用户选区。插入后用 `setSelection(..., SILENT)`——不抢焦点、也不把 `hasSelection` 置真——代价是 `Quill.setSelection` 会连自动滚动一起跳过，所以**必须紧跟一次 `scrollSelectionIntoView()`**，否则插入点在视野外时（单行模式横向溢出）不会滚动。jsdom 无布局，测试只能断言"向 Quill 请求了滚动"。

**重复匹配串。** `VariableBinding` 构造时校验 `token` 与 `label` 是否重复并 `warn()`：匹配表是 `Map.set`，重复会让后来者静默覆盖先者，否则症状只是"某个变量插不进去 / 粘贴不识别"，很难排查。两个维度互相独立——`token` 冲突影响 `setText`，`label` 冲突影响粘贴匹配。

**`singleLine`。** 该模式下禁止换行，且**不创建字数节点**（`createCountElement` 里首个判断）。换行清理由 `EditorFacade.sanitizeText` 在变量转换之前固定执行，所以 `setText` 与粘贴两条入口都覆盖，且变量匹配时文本里已无换行。隐藏计数与 `maxLength` 截断是两件事：截断逻辑在 `handleTextChange` 里，与计数节点无关，不要连带关掉。

**兼容性姿态。** 项目当前是 `0.1.0` 且尚未发布，因此重命名、删参数、改数据形状都直接做，不写向后兼容分支。若即将发布，需在改动前确认。

## 代码风格

- 2 空格缩进，单引号，语句结尾带分号。**写代码时不用记这些**——`prettier` 按 `.prettierrc.json` 强制统一，`src/`、`tests/`、`examples/` 一视同仁（示例不再单独用 Tab + 双引号）。
- 注释、README、提交信息用中文；测试用例名用英文（`it('converts only token matches ...')`）。
- 类型/接口/导出函数的 JSDoc 用中文，说明"为什么"而不只是"是什么"。

两个工具都已接入 `verify`（因此 PR 与 main 推送都会跑），提交前跑一次即可：

- **Prettier** 管格式，范围由 `.prettierignore` 决定。**Markdown 刻意排除在外**：Prettier 按「字符数」对齐表格，而中日韩字符占 2 个显示宽度，会把中文表格补齐到等字符数、渲染出来列宽依然是乱的，比不对齐的紧凑写法更差。改文档时别加回 `*.md`。
- **Oxlint** 管代码质量，配置在 `.oxlintrc.json`，开了**类型感知**（`options.typeAware`）。它按项目内的 `tsconfig.json` 分析类型，所以 `pnpm run check`（`tsc --noEmit`）仍然保留——`.vue` 的模板类型它同样不检查。
- `.oxlintrc.json` 里显式关掉了 4 条规则，每条都附了「为什么在这个项目里不适用」的注释（如 `no-array-sort` 建议的 `toSorted()` 是 ES2023，而本项目 target/lib 是 ES2022）。**关规则前先读注释**，别当成可以顺手打开的优化项；反过来，往清单里加规则前也先跑一遍看它到底报几处、改动是让代码更好还是更差。

## 测试约定

- Vitest + jsdom，`globals: true`（`vitest.config.ts`），测试文件放 `tests/*.test.ts`。
- 公共行为优先通过 `createEditor` 做端到端断言（读 DOM 类名、`dataset`、`getText()`、`getVariables()`、字数节点文本），内部纯函数（`getContentLength`、`textToVariableDelta`，从 `core/variable/tokens` 引入）直接断言 Delta。
- 断言 console 警告时用 `vi.spyOn(console, 'warn').mockImplementation(...)`，并放在 `try/finally` 里 `mockRestore()`。
- 粘贴路径（`EditorFacade.patchClipboard`）在 `tests/paste.test.ts` 里用派发的 `paste` 事件覆盖：`new Event('paste', { cancelable: true })` 再用 `Object.defineProperty` 挂一个假的 `clipboardData`。该文件在 `beforeAll` 里补了 `Range.prototype.getBoundingClientRect`，否则 Quill 粘贴后的 `scrollSelectionIntoView` 会在 jsdom 抛未处理异常。
- 需要验证 `.vue` 组件挂载时：默认 vitest 配置**不带** Vue 插件，直接 import `.vue` 会报 "Install @vitejs/plugin-vue"。用一次性的临时配置（`plugins: [vue()]`）加临时测试文件跑完即删，不要为了调试往仓库里加依赖或永久配置。

## 已知限制

- `pnpm run check` 是 `tsc --noEmit`，**不检查 `.vue` 的模板类型**（`src/env.d.ts` 只声明了 `*.vue` 模块形状）。示例模板里避免依赖模糊行为（例如嵌套对象属性中的 ref 是否解包），用顶层解构或显式 `.value`。
- jsdom 不解析 `<style scoped>`，也不做布局计算，`getComputedStyle` 拿不到实际样式结果。样式改动请通过构建产物 CSS 文本或浏览器确认。
- 示例直接从 `../src` 引入，所以 `examples/main.ts` 显式 import 了 `quill/dist/quill.core.css` 与 `../src/style.css`——`src/index.ts` 里对 CSS 的副作用式 import 在「从源码打包」时不会进入产物（与 `package.json` 的 `sideEffects` 数组有关），别当成冗余删掉。发布产物不受影响：`vite build` 会把所有 CSS 提取成单个 `dist/style.css`。
- `dist/` 与 `dist-example/` 是构建产物（已 gitignore），不要手改；样式或类型声明不一致时跑 `pnpm run build` 重新生成。
- Vue 的 DOM 更新是异步的：挂载后立刻读文本会拿到旧值，断言前需要 `await nextTick()`。
