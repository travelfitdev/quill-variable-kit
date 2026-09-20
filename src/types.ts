/**
 * 一个可插入文档的变量。
 * `token` 是匹配串，也是 `getText()` 的输出与落库值（例如 `{{username}}`）。
 * 它会被**逐字**匹配，定界符是语法的一部分，所以不是可以自由命名的标识符；
 * 长 token 优先匹配，避免短 token 先吃掉长 token 的前缀。
 * `label` 是展示文本，同时也会作为粘贴纯文本时的匹配串。配置时可省略，缺省等于 `token`。
 */
export interface Variable {
  token: string;
  label?: string;
}

/** 文档中一个变量的出现统计，由 `getVariables()` 返回。 */
export interface VariableUsage {
  /** 命中的 `token`。 */
  token: string;
  /** 文档中实际渲染的展示文本。 */
  label: string;
  /** 出现次数。 */
  count: number;
}

/** 创建编辑器的选项。 */
export interface EditorOptions {
  /** 编辑器容器元素。 */
  element: HTMLElement;
  /** 编辑区为空时显示的提示文本。 */
  placeholder?: string;
  /** 最大字数；换行和变量不计入。 */
  maxLength?: number;
  /** 配置 maxLength 后是否显示字数，默认 true。 */
  showCount?: boolean;
  /** 变量集合。 */
  variables?: Variable[];
  /** 设为 false 时，编辑区高度由内容撑开。 */
  scroll?: boolean;
  /** 设为 true 时创建即为只读展示态；运行时可调用 enable() 恢复编辑。 */
  readOnly?: boolean;
  /** 启用后禁止换行，并合并粘贴或 setText 中的换行。 */
  singleLine?: boolean;
  /** 用户或 API 内容变更后的回调。 */
  onChange?: (editor: EditorInstance) => void;
}

/** 编辑器实例的稳定公共接口。 */
export interface EditorInstance {
  /** 以纯文本读取内容；变量输出为 token。 */
  getText(): string;
  /** 完整替换文本；匹配的变量 token 会被转成嵌入节点。 */
  setText(text: string): void;
  /** 在当前选区插入一个变量；未聚焦时追加到文本末尾。展示文本取配置的 label。 */
  insertVariable(token: string): void;
  /** 按文档顺序列出实际出现的变量；不含配置了但未使用的。 */
  getVariables(): VariableUsage[];
  disable(): void;
  enable(): void;
  /** 清理事件与包创建的计数节点；由调用方继续清理容器节点。 */
  destroy(): void;
  getOptions(): Readonly<EditorOptions>;
}
