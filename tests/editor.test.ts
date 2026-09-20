import Quill from 'quill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditor } from '../src';
import { getContentLength, textToVariableDelta } from '../src/core/variable/tokens';

describe('variable helpers', () => {
  it('converts only token matches, leaving labels as plain text', () => {
    const delta = textToVariableDelta('A {{name}} 客户姓名', [
      { token: '{{name}}', label: '客户姓名' },
    ]);
    expect(delta.ops).toEqual([
      { insert: 'A ' },
      { insert: { variable: { token: '{{name}}', label: '客户姓名' } } },
      { insert: ' 客户姓名' },
    ]);
  });

  it('excludes newlines and token matches from content length', () => {
    expect(
      getContentLength('A\n{{name}}客户姓名', [{ token: '{{name}}', label: '客户姓名' }]),
    ).toBe('A客户姓名'.length);
  });

  it('falls back to token when label is omitted', () => {
    const delta = textToVariableDelta('A {{name}}', [{ token: '{{name}}' }]);
    expect(delta.ops).toEqual([
      { insert: 'A ' },
      { insert: { variable: { token: '{{name}}', label: '{{name}}' } } },
    ]);
    expect(getContentLength('{{name}}', [{ token: '{{name}}' }])).toBe(0);
  });
});

describe('createEditor', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  it('converts initial tokens, updates the count, and cleans up package-owned DOM', () => {
    const onChange = vi.fn();
    const editor = createEditor({
      element,
      maxLength: 10,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
      onChange,
    });
    editor.setText('Hi {{name}}');

    expect(editor.getText()).toBe('Hi {{name}}');
    const blot = element.querySelector<HTMLElement>('.ql-variable');
    expect(blot?.textContent).toBe('客户姓名');
    expect(blot?.dataset.token).toBe('{{name}}');
    expect(blot?.dataset.label).toBe('客户姓名');
    expect(element.querySelector('.rich-editor-count')?.textContent).toBe('3/10');
    expect(onChange).toHaveBeenCalledTimes(1);

    editor.destroy();
    expect(element.querySelector('.rich-editor-count')).toBeNull();
  });

  it('does not convert labels into variables in setText', () => {
    const editor = createEditor({
      element,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
    });
    editor.setText('您好，客户姓名');

    expect(editor.getText()).toBe('您好，客户姓名');
    expect(element.querySelector('.ql-variable')).toBeNull();
    expect(element.querySelector('.ql-editor')?.textContent).toBe('您好，客户姓名');
    editor.destroy();
  });

  it('inserts configured variables and rejects unknown tokens', () => {
    const editor = createEditor({
      element,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      editor.insertVariable('{{unknown}}');
      expect(editor.getText()).toBe('');
      expect(element.querySelector('.ql-variable')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toBe(
        '[quill-variable-kit] insertVariable 收到未配置的 token：{{unknown}}\n' +
          '  可用的 token："{{name}}"\n' +
          '  该调用已被忽略，请在 variables 中配置该 token。',
      );
    } finally {
      warn.mockRestore();
    }

    editor.insertVariable('{{name}}');
    expect(editor.getText()).toBe('{{name}}');
    expect(element.querySelector('.ql-variable')?.textContent).toBe('客户姓名');

    // 展示文本只能来自配置：多余的实参不会生效，也不会污染落库的 label。
    (editor.insertVariable as (token: string, extra?: string) => void)(
      '{{name}}',
      '{{overridden}}',
    );
    const embeds = element.querySelectorAll('.ql-variable');
    expect(embeds).toHaveLength(2);
    expect(embeds[1]?.textContent).toBe('客户姓名');
    expect(embeds[1]?.getAttribute('data-label')).toBe('客户姓名');
    editor.destroy();
  });

  it('warns when two variables share a token or a label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const editor = createEditor({
        element,
        variables: [
          { token: '{{name}}', label: '客户姓名' },
          { token: '{{name}}', label: '客户电话' },
          { token: '{{phone}}', label: '客户电话' },
        ],
      });
      // 重复的匹配串只会让最后一项生效，配置期就点名，避免运行期表现为"插不进去"。
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toBe(
        '[quill-variable-kit] variables 中存在重复的匹配串：token "{{name}}"、label "客户电话"\n' +
          '  同一条匹配串只有最后一项会生效，请调整配置。',
      );
      editor.destroy();
    } finally {
      warn.mockRestore();
    }
  });

  it('lists the variables present in the document, in order, with counts', () => {
    const editor = createEditor({
      element,
      variables: [
        { token: '{{name}}', label: '客户姓名' },
        { token: '{{phone}}', label: '客户电话' },
        { token: '{{unused}}', label: '未使用' },
      ],
    });
    editor.setText('{{phone}} 与 {{name}}，再次 {{phone}}');

    // 只报告实际出现的变量，配置了但未使用的 {{unused}} 不进入结果。
    editor.insertVariable('{{phone}}');
    expect(editor.getVariables()).toEqual([
      { token: '{{phone}}', label: '客户电话', count: 3 },
      { token: '{{name}}', label: '客户姓名', count: 1 },
    ]);
    editor.destroy();
  });

  it('reports no variables when none are configured', () => {
    const editor = createEditor({ element });
    editor.setText('{{name}}');
    // 未配置 token 时它只是普通文本，不会被识别成变量。
    expect(editor.getVariables()).toEqual([]);
    expect(editor.getText()).toBe('{{name}}');
    editor.destroy();
  });

  it('asks Quill to scroll the caret into view after inserting, but not after rejecting a token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = createEditor({
      element,
      singleLine: true,
      variables: [{ token: '{{name}}', label: '客户姓名' }],
    });
    // jsdom 没有布局，量不出真实滚动距离，只能断言「向 Quill 请求了滚动」。
    const scrollIntoView = vi.spyOn(Quill.prototype, 'scrollSelectionIntoView');
    try {
      editor.insertVariable('{{unknown}}');
      expect(scrollIntoView).not.toHaveBeenCalled();

      editor.insertVariable('{{name}}');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      scrollIntoView.mockRestore();
      warn.mockRestore();
      editor.destroy();
    }
  });

  it('removes newlines in single-line setText input', () => {
    const editor = createEditor({ element, singleLine: true });
    editor.setText('first\nsecond');
    expect(editor.getText()).toBe('firstsecond');
    editor.destroy();
  });

  it('hides the count in single-line mode while still enforcing maxLength', () => {
    const editor = createEditor({ element, singleLine: true, maxLength: 5 });
    expect(element.querySelector('.rich-editor-count')).toBeNull();

    editor.setText('123456');
    expect(editor.getText()).toBe('123456');
    editor.destroy();
  });

  it('shows the count when maxLength is set and single-line is off', () => {
    const editor = createEditor({ element, maxLength: 5 });
    editor.setText('abc');
    expect(element.querySelector('.rich-editor-count')?.textContent).toBe('3/5');
    editor.destroy();
  });
});
