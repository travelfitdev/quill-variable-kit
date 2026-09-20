# quill-variable-kit

一个基于 Quill 2 的轻量、框架无关富文本编辑器封装，内置变量、单行模式和字数限制。

在线示例：<https://travelfitdev.github.io/quill-variable-kit/>

## 特性

- **变量**：文本中命中的 `token`（如 `{{name}}` / `#NAME#`）会被识别为不可编辑的嵌片，按配置的 `label` 展示；各入口的识别规则见「变量规则」。
- **单行模式**：`singleLine: true` 时禁止换行并自动清理写入或粘贴的换行，内容横向滚动。
- **字数限制**：超过 `maxLength` 的输入自动回退，附展示用计数节点；换行与变量 `token` 不计入。
- **跨编辑器粘贴校准**：粘贴时按目标编辑器的 `variables` 配置校验、重建或降级变量，不会把陌生 `token` 写入文档。
- **只读模式**：`readOnly: true` 创建即为只读展示态，文本可选中复制；运行时 `enable()` 即可恢复编辑。
- **框架无关**：只依赖 DOM，原生 JS 与 React/Vue 等框架均可用。

## 安装

```bash
pnpm add quill-variable-kit quill parchment
```

`quill` 与 `parchment` 是 peer 依赖，需宿主应用自行安装且版本兼容；包同时提供 ESM 与 CJS 产物。

## 使用

```ts
import { createEditor } from 'quill-variable-kit';
import 'quill-variable-kit/style.css';

const editor = createEditor({
  element: document.querySelector<HTMLElement>('#editor')!,
  placeholder: '请输入内容',
  maxLength: 100,
  variables: [
    { token: '{{name}}', label: '客户姓名' },
    { token: '#CITY#', label: '城市' },
  ],
  onChange(instance) {
    console.log(instance.getText());
  },
});

editor.setText('您好，{{name}}');
console.log(editor.getText()); // 您好，{{name}}
editor.insertVariable('#CITY#');

// React/Vue 等框架卸载组件时调用。
editor.destroy();
```

样式：`style.css` 需**显式引入**——构建产物把 Quill 基础样式与应用样式合并为单个文件，打包后的 JS 不会自动注入 CSS。`element` 必须是已插入文档的容器元素。

## API

### `createEditor(options)`

创建 `EditorInstance`。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `element` | `HTMLElement` | 编辑器容器，必填，且需已插入文档。 |
| `placeholder` | `string` | 空内容提示文本。 |
| `maxLength` | `number` | 最大字数；换行和变量不计入。 |
| `showCount` | `boolean` | 配置字数限制后是否展示计数，默认 `true`；`singleLine` 为 `true` 时始终不展示。 |
| `variables` | `Variable[]` | 变量配置，决定哪些 `token` / `label` 会被识别。 |
| `scroll` | `boolean` | 设为 `false` 时编辑区高度由内容撑开。 |
| `singleLine` | `boolean` | 禁止换行，并清理粘贴或 `setText` 中的换行；同时不展示字数计数。 |
| `readOnly` | `boolean` | 默认 `false`；设为 `true` 时创建即为只读展示态，运行时调用 `enable()` 可恢复编辑。 |
| `onChange` | `(editor) => void` | 内容变化后的回调，含 `setText` 等 API 写入；参数为当前 `EditorInstance`。 |

### `EditorInstance`

- `getText()`：读取纯文本；变量导出为 `token`。段落之间的换行保留，末尾的段落换行会被剥离。
- `setText(text)`：替换全部内容；**只识别 `token`**，`label` 按普通文本处理。
- `insertVariable(token)`：在选区插入不可编辑变量，未聚焦时追加到末尾；展示文本取配置的 `label`。`token` 必须已配置，否则忽略该调用并在控制台输出警告。
- `getVariables()`：按首次出现的顺序统计文档里实际落地的变量，返回 `VariableUsage[]`；配置了但未使用的变量不出现。
- `disable()` / `enable()`：切换编辑状态。`readOnly: true` 创建出来的编辑器初始即禁用态，`enable()` 后恢复编辑；两者在运行时是同一开关。
- `getOptions()`：创建选项的只读快照。
- `destroy()`：清理内部事件与包创建的计数节点；容器 DOM 由调用方自行移除。

### 类型

- `Variable { token: string; label?: string }`：`label` 省略时等于 `token`。
- `VariableUsage { token: string; label: string; count: number }`：`getVariables()` 的结果，`label` 取文档中实际渲染的值。

## 变量规则

变量由 `token` 与 `label` 组成：`token` 是匹配串，也是 `getText()` 的输出与落库值（例如 `{{name}}`、`#NAME#`）；`label` 是展示文本（省略时等于 `token`）。`token` 被**逐字**匹配，定界符是语法的一部分，因此不是可以自由命名的标识符。

- `setText` 只识别 `token`；粘贴文本只识别 `label`。
- `getText` 返回 `token`；复制或剪切变量时返回 `label`。
- 字数只扣除 `token`，`label` 照常计数。
- `insertVariable` 只接受已配置的 `token`；展示文本只能来自配置的 `label`，不支持逐次覆盖。
- `getVariables()` 从文档里实际落地的节点统计，不解析文本，因此不会被互为子串的 `token` 干扰。
- 两个变量的 `token` 或 `label` 重复时只有最后一项生效，配置期会输出警告。

### 跨编辑器粘贴

从一个编辑器复制、粘贴到另一个编辑器时，落地前按**目标编辑器的配置**校验：

- `token` 在目标配置中存在 → 保留变量，展示文本换成目标配置的 `label`。
- `token` 不存在 → 降级成源 `label` 的**普通文本**，避免陌生 `token` 写入文档；该文本随后仍会参与一次 `label` 匹配，若目标恰好把该 `label` 配成了变量，会在目标里被重新识别。

因此两个编辑器的 `variables` 配置不同时，结果始终以目标配置为准，既不会出现「变量带着陌生 `token` 落地」，也不会让变量被误算进字数。