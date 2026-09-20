import Quill, { Delta } from 'quill';
import type { QuillOptions } from 'quill';
import { InternalEditor } from './editor';
import { VariableBinding } from './variable';
import { installSingleLine, stripNewlines } from './single-line';
import type { EditorInstance, EditorOptions, VariableUsage } from '../types';

interface ClipboardModule {
  convert(input: { html?: string; text?: string }, formats?: Record<string, unknown>): Delta;
}

function stripFormats(delta: Delta): Delta {
  return new Delta({
    ops: delta.ops.map((op) => (typeof op.insert === 'string' ? { insert: op.insert } : op)),
  });
}

class EditorFacade implements EditorInstance {
  private readonly editor: InternalEditor;
  private readonly options: Readonly<EditorOptions>;
  private readonly variable: VariableBinding | null;
  private countElement: HTMLElement | null = null;
  private lastCountText: string | null = null;

  constructor(options: EditorOptions) {
    this.options = Object.freeze({
      ...options,
      variables: options.variables?.slice(),
    });
    const quillOptions: QuillOptions = {
      placeholder: this.options.placeholder,
    };
    this.editor = new InternalEditor(this.options.element, quillOptions);
    if (this.options.singleLine) installSingleLine(this.editor);
    const variables = this.options.variables;
    this.variable = variables?.length ? new VariableBinding(this.editor, variables) : null;
    if (this.options.scroll === false) {
      this.editor.root.style.overflow = 'visible';
      this.editor.container.style.height = 'auto';
    }
    this.createCountElement();
    this.editor.on(Quill.events.TEXT_CHANGE, this.handleTextChange);
    this.patchClipboard();
  }

  private createCountElement(): void {
    if (this.options.singleLine) return;
    if (typeof this.options.maxLength !== 'number' || this.options.maxLength <= 0) return;
    if (this.options.showCount === false) return;
    this.countElement = document.createElement('div');
    this.countElement.className = 'rich-editor-count';
    this.options.element.appendChild(this.countElement);
    this.updateCount(this.getContentLength());
  }

  /**
   * 文本进入插件管线前先过 core 自身的约束（目前只有单行去换行）。
   * 固定排在插件之前，保证变量匹配时文本里已经没有换行。
   */
  private sanitizeText(delta: Delta): Delta {
    return this.options.singleLine ? stripNewlines(delta) : delta;
  }

  private patchClipboard(): void {
    const clipboard = this.editor.getModule('clipboard') as ClipboardModule;
    const originalConvert = clipboard.convert.bind(clipboard);
    clipboard.convert = (input, formats) => {
      const sanitized = this.sanitizeText(stripFormats(originalConvert(input, formats)));
      return this.variable?.transformPastedDelta(sanitized) ?? sanitized;
    };
  }

  private getContentLength(): number {
    const text = this.getText();
    return this.variable ? this.variable.measureText(text) : text.replace(/\r\n|\r|\n/g, '').length;
  }

  private updateCount(length: number): void {
    if (!this.countElement) return;
    const text = `${length}/${this.options.maxLength}`;
    if (text === this.lastCountText) return;
    this.lastCountText = text;
    this.countElement.textContent = text;
  }

  private handleTextChange = (delta: Delta, oldContents: Delta, source: string): void => {
    const { maxLength, onChange } = this.options;
    if (typeof maxLength === 'number' && maxLength > 0) {
      const length = this.getContentLength();
      if (source === Quill.sources.USER && length > maxLength) {
        this.editor.updateContents(delta.invert(oldContents), Quill.sources.SILENT);
        this.updateCount(this.getContentLength());
        return;
      }
      this.updateCount(length);
    }
    onChange?.(this);
  };

  getText(): string {
    const text = this.editor
      .getContents()
      .ops.map((op) => {
        if (typeof op.insert === 'string') return op.insert;
        if (!op.insert || typeof op.insert !== 'object') return '';
        const [name] = Object.keys(op.insert);
        const definition = this.editor.scroll.query(name) as {
          textOf?: (value: unknown) => string;
        } | null;
        return definition?.textOf ? definition.textOf(op.insert[name]) : '';
      })
      .join('');

    // Quill 的块模型给每个段落（含最后一段）都补一个结尾换行，属于文档结构而非用户内容，
    // 统一在出口剥离，避免调用方各自处理；段落之间的换行保留
    return text.replace(/\n+$/, '');
  }

  setText(text: string): void {
    const sanitized = this.sanitizeText(new Delta().insert(text));
    this.editor.setContents(
      this.variable?.transformInsertedText(sanitized) ?? sanitized,
      Quill.sources.API,
    );
  }

  insertVariable(token: string): void {
    this.variable?.insertVariable(token);
  }

  getVariables(): VariableUsage[] {
    return this.variable?.getVariables() ?? [];
  }

  disable(): void {
    this.editor.enable(false);
  }

  enable(): void {
    this.editor.enable(true);
  }

  destroy(): void {
    this.variable?.destroy();
    this.editor.off(Quill.events.TEXT_CHANGE, this.handleTextChange);
    this.countElement?.remove();
    this.countElement = null;
  }

  getOptions(): Readonly<EditorOptions> {
    return this.options;
  }
}

/** 创建一个富文本编辑器。调用方应在容器销毁前调用 destroy()。 */
export function createEditor(options: EditorOptions): EditorInstance {
  return new EditorFacade(options);
}
