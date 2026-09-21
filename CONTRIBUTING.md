# 贡献指南

面向人类贡献者。**代理与仓库内部机制见 [`AGENTS.md`](./AGENTS.md)**——两边分工是：这里讲「怎么参与」，那边讲「代码怎么组织、为什么这么设计」。

## 环境准备

```bash
pnpm install
```

Node >= 20（CI 用 24），包管理器用 pnpm（版本由 `package.json` 的 `packageManager` 锁定，corepack 会自动处理）。

`quill` 是 peer 依赖，宿主应用需自行安装；本地开发由 devDependencies 兜底，所以 `pnpm install` 之后就能直接跑示例。

## 提交流程

**日常改动直接推到 `main`**，不需要开分支——`pre-push` 钩子会强制跑一遍 `pnpm run verify`，坏提交推不上去。

**只有一种情况需要开分支 + PR**：你希望这次改动在 GitHub Release 的自动发布说明里**单独分栏**。

原因是发布说明的自动分类只认 **PR 上的 label**，不看 commit message 的 `type` 前缀。直推 `main` 的提交没有 PR，也就没有 label，会被归到「🔧 其他改动」栏。

做法：

```bash
git switch -c feat/xxx      # 从最新 main 切出
# ... 改代码 ...
pnpm run verify             # 先本地过门禁
git commit -m "feat(xxx): 说明为什么"
git push -u origin feat/xxx
```

然后在 GitHub 上开 PR，**在右侧 Labels 里打上对应标签**（label 必须在 PR 上，且要在合并前打），等 CI 通过后合并。

分支名用 `<type>/<简述>` 即可，合并后删掉分支——**不保留长期分支**，`main` 是唯一的开发主线。

### label 对照表

label 与 commitlint 约束的 `type` 一一对应，看提交前缀就知道打哪个：

| 提交 type | 打这个 label |
| --- | --- |
| `feat` | `enhancement` |
| `fix` | `bug` |
| `docs` | `documentation` |
| `refactor` | `refactor` |
| `perf` | `perf` |
| `style` | `style` |
| `test` | `test` |
| `build` | `build` |
| `ci` | `ci` |
| `chore` | `chore` |
| `revert` | `revert` |
| 破坏性变更（`!` 或 `BREAKING CHANGE`） | `breaking` |

分类规则本身在 [`.github/release.yml`](./.github/release.yml) 里。

## 提交信息

遵循 Conventional Commits：`<type>(<scope>): <subject>`。

- **`subject` 用中文，说明「为什么」而不是「做了什么」**。`fix(variable): 避免重复 token 静默覆盖` 比 `fix(variable): 修改 Map 赋值` 有用。
- `type` 在 `feat / fix / refactor / docs / style / test / chore / build / ci / perf / revert` 里选；`scope` 可选，小到能力模块（如 `variable`、`single-line`）。
- 一个提交只做一件事。
- 破坏性变更在 `type` 后加 `!`，或写 `BREAKING CHANGE` footer。

**格式由 commitlint 强制校验**：`git commit` 时会经 husky 的 `commit-msg` 钩子跑 `pnpm exec commitlint --edit`，不合规直接拦下。**不要用 `--no-verify` 绕过**。

## 提交前验证

```bash
pnpm run verify
```

它等于 `format:check + lint + check + test + build + example:build + pack:check`，也就是 CI（`.github/workflows/verify.yml`）跑的那一条。改动完成前请务必跑通。

`git push` 时 `pre-push` 钩子会自动再跑一次，所以即使忘了也会被拦下（本地热缓存下约几秒）。只推 tag 时会跳过。

## 代码风格

**格式和 lint 都由工具强制，不用靠自觉：**

```bash
pnpm run format   # prettier --write .，自动改好格式
pnpm run lint     # oxlint，报代码质量问题
```

- **Prettier** 管格式：2 空格缩进、单引号、带分号，`src/`、`tests/`、`examples/` 统一一套（示例不再用 Tab + 双引号）。配置在 `.prettierrc.json`，范围由 `.prettierignore` 决定——**Markdown 刻意排除在外**，因为 Prettier 对不齐中日韩字符的表格宽度。
- **Oxlint** 管代码质量，开了类型感知。配置在 `.oxlintrc.json`，里面显式关掉的规则都附了原因，改动前先读注释。

提交前跑一次 `pnpm run format` 就能修掉绝大部分格式问题。

剩下这些工具管不了，仍然靠人：

- **注释用中文**；测试用例名用英文（`it('converts only token matches ...')`）
- 类型 / 接口 / 导出函数的 JSDoc 用中文，说明「为什么」而不只是「是什么」
- 一个提交只做一件事

更细的代码组织约定（能力机制、必须遵守的不变量、测试约定、已知限制）见 [`AGENTS.md`](./AGENTS.md)。

## 发布

发版是维护者动作，步骤见 [`AGENTS.md`](./AGENTS.md) 的「发布流程」一节。贡献者不需要关心。
