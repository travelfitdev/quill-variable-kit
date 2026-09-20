import Quill from 'quill';
import { EmbedBlot } from 'parchment';
import type { Variable } from '../../types';

export const VARIABLE_BLOT_NAME = 'variable';

/**
 * 变量数据形状的唯一归一化入口：`label` 缺省等于 `token`。
 *
 * 读的是不可信的 Delta payload 与剪贴板 HTML，所以接受 `Partial<Variable>`。
 * `create` / `value` 与 token 匹配都走这里，这样"改字段名必须同时改 create 与 value
 * 两侧"就不再依赖人工同步——两侧共用同一个定义。
 */
export function normalizeVariable(value: Partial<Variable> | null | undefined): Required<Variable> {
  const token = value?.token ?? '';
  return { token, label: value?.label || token };
}

/**
 * 变量节点：把 `{ token, label }` 写进 `dataset.token` / `dataset.label`，并用 `value()` 读回。
 * 历史 Delta 与 DOM 数据集都依赖这个形状，改字段名属于破坏性变更。
 */
export class VariableBlot extends EmbedBlot {
  static blotName = VARIABLE_BLOT_NAME;
  static tagName = 'span';
  static className = 'ql-variable';

  static create(value: Partial<Variable>): HTMLElement {
    const node = super.create() as HTMLElement;
    const { token, label } = normalizeVariable(value);
    node.dataset.token = token;
    node.dataset.label = label;
    node.contentEditable = 'false';
    node.textContent = label;
    return node;
  }

  static value(node: HTMLElement): Variable {
    return normalizeVariable({ token: node.dataset.token, label: node.dataset.label });
  }

  /** 导出为纯文本时使用的值。 */
  static textOf(data: unknown): string {
    const { token, label } = normalizeVariable(data as Partial<Variable>);
    return token || label || '';
  }
}

// 不写 <object>：那是 WeakSet 的默认类型参数，省略后推断结果完全相同。
const registeredConstructors = new WeakSet();

/** 只注册 blot；变量能力本身是 core 模块，不占用 Quill 的模块注册表。 */
export function registerVariableBlot(QuillConstructor: typeof Quill = Quill): void {
  if (registeredConstructors.has(QuillConstructor)) return;
  QuillConstructor.register(VariableBlot);
  registeredConstructors.add(QuillConstructor);
}
