import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEditor } from '../src';

/**
 * jsdom 的 Range 没有布局方法，而 Quill 粘贴结束后会调用它把光标滚入视野。
 * 不补这个方法，粘贴虽然已经写入文档，却会抛出未处理异常。
 */
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
});

afterAll(() => {
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});

function paste(element: HTMLElement, text: string): void {
  const root = element.querySelector('.ql-editor') as HTMLElement;
  root.focus();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : ''), files: [] },
  });
  root.dispatchEvent(event);
}

/** 模拟浏览器携带 HTML 的粘贴——跨编辑器复制粘贴走的是这条路径。 */
function pasteHtml(element: HTMLElement, html: string): void {
  const root = element.querySelector('.ql-editor') as HTMLElement;
  root.focus();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/html' ? html : ''), files: [] },
  });
  root.dispatchEvent(event);
}

/** 取容器里所有变量节点的 `token/label`，用来断言最终落在文档里的形状。 */
function embedTokens(element: HTMLElement): string[] {
  return [...element.querySelectorAll('.ql-variable')].map(
    (node) => `${(node as HTMLElement).dataset.token}/${node.textContent}`,
  );
}

describe('paste pipeline', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  it('removes newlines when pasting into a single-line editor', () => {
    const editor = createEditor({ element, singleLine: true });
    paste(element, 'first\nsecond');
    expect(editor.getText()).toBe('firstsecond');
    editor.destroy();
  });

  it('converts pasted labels into variables', () => {
    const editor = createEditor({
      element,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
    });
    paste(element, 'hi 客户姓名');
    expect(editor.getText()).toBe('hi {{name}}');
    expect(element.querySelector('.ql-variable')?.textContent).toBe('客户姓名');
    editor.destroy();
  });

  it('cleans newlines before matching labels, so a split label still converts', () => {
    const editor = createEditor({
      element,
      singleLine: true,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
    });
    paste(element, '客户\n姓名');
    expect(editor.getText()).toBe('{{name}}');
    expect(element.querySelector('.ql-variable')?.textContent).toBe('客户姓名');
    editor.destroy();
  });
});

describe('cross-editor paste', () => {
  let element: HTMLElement;
  let source: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
    source = document.createElement('div');
    document.body.appendChild(source);
  });

  /** 造一份"从别的编辑器复制出来"的 HTML：变量节点带源 token 与源 label。 */
  function sourceHtml(
    variables: Array<{ token: string; label: string }>,
    text: string,
  ): string {
    const editor = createEditor({ element: source, variables });
    editor.setText(text);
    const html = (source.querySelector('.ql-editor') as HTMLElement).innerHTML;
    editor.destroy();
    return html;
  }

  it('degrades a variable whose token is not configured in the target', () => {
    const html = sourceHtml(
      [
        { token: '{{username}}', label: '#客户姓名#' },
        { token: '{{phone}}', label: '#客户电话#' },
      ],
      '您好，{{username}}，电话 {{phone}}',
    );
    const editor = createEditor({
      element,
      variables: [
        { token: '#username#', label: '#姓名#' },
        { token: '#phone#', label: '#电话#' },
      ],
    });
    pasteHtml(element, html);
    // 关键点：目标里不能留下它不认识的 token，降级后是源 label 的普通文本。
    expect(editor.getText()).toBe('您好，#客户姓名#，电话 #客户电话#');
    expect(element.querySelectorAll('.ql-variable')).toHaveLength(0);
    editor.destroy();
  });

  it('re-identifies the degraded text as the target own variable', () => {
    const html = sourceHtml([{ token: '{{username}}', label: '#客户姓名#' }], '您好，{{username}}');
    const editor = createEditor({
      element,
      // 目标用不同的 token，但 label 恰好同名 —— 降级文本应被重新识别。
      variables: [{ token: '#name#', label: '#客户姓名#' }],
    });
    pasteHtml(element, html);
    expect(editor.getText()).toBe('您好，#name#');
    expect(embedTokens(element)).toEqual(['#name#/#客户姓名#']);
    editor.destroy();
  });

  it('keeps the embed and relabels it when the token exists in the target', () => {
    const html = sourceHtml([{ token: '{{name}}', label: 'OLD' }], 'A {{name}} B');
    const editor = createEditor({
      element,
      variables: [{ token: '{{name}}', label: 'NEW' }],
    });
    pasteHtml(element, html);
    expect(editor.getText()).toBe('A {{name}} B');
    expect(embedTokens(element)).toEqual(['{{name}}/NEW']);
    editor.destroy();
  });

  it('leaves an identical-configuration round trip unchanged', () => {
    const config = [{ token: '{{username}}', label: '#客户姓名#' }];
    const html = sourceHtml(config, 'A {{username}} B');
    const editor = createEditor({ element, variables: config });
    pasteHtml(element, html);
    expect(editor.getText()).toBe('A {{username}} B');
    expect(embedTokens(element)).toEqual(['{{username}}/#客户姓名#']);
    editor.destroy();
  });

  it('does not re-match a label that the target does not declare', () => {
    const html = sourceHtml([{ token: '{{x}}', label: '客户姓名' }], 'A {{x}} B');
    const editor = createEditor({
      element,
      variables: [{ token: '{{y}}', label: '电话' }],
    });
    pasteHtml(element, html);
    expect(editor.getText()).toBe('A 客户姓名 B');
    expect(element.querySelectorAll('.ql-variable')).toHaveLength(0);
    editor.destroy();
  });

  it('keeps unknown embeds counted as plain text for maxLength', () => {
    const html = sourceHtml([{ token: '{{unknown}}', label: 'AB' }], '{{unknown}}');
    const editor = createEditor({
      element,
      maxLength: 10,
      variables: [{ token: '{{known}}', label: 'ZZ' }],
    });
    pasteHtml(element, html);
    // 降级成普通文本后应当照常计入字数（源 token 不是目标的变量）。
    expect(element.querySelector('.rich-editor-count')?.textContent).toBe('2/10');
    editor.destroy();
  });
});
