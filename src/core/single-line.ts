import type Quill from 'quill';
import { Delta } from 'quill';

/** 去掉 Delta 里的换行；清空后的 op 直接丢弃，避免留下空 insert。 */
export function stripNewlines(delta: Delta): Delta {
  const cleaned = new Delta();
  delta.ops.forEach((op) => {
    if (typeof op.insert !== 'string') {
      cleaned.push(op);
      return;
    }
    const text = op.insert.replace(/\r\n|\r|\n/g, '');
    if (text) cleaned.insert(text, op.attributes);
  });
  return cleaned;
}

/**
 * 单行模式：编辑器自身的行为约束（禁止换行、隐藏字数）。
 * 换行清理由 `EditorFacade` 在占位符转换之前调用 `stripNewlines`——
 * 于是"先清换行、再转换占位符"是结构上的保证，而不是一条靠人记住的顺序约定。
 * 样式在 `src/style.css` 的 `.ql-single-line` 段：它覆盖外壳布局，所以不跟到这里来。
 */
export function installSingleLine(quill: Quill): void {
  quill.keyboard.bindings.Enter.unshift({ key: 'Enter', handler: () => undefined });
  quill.root.style.whiteSpace = 'nowrap';
  quill.container.classList.add('ql-single-line');
}
