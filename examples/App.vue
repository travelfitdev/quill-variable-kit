<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, type Ref } from 'vue';
import { createEditor, type EditorInstance, type Variable } from '../src';

function useDemo(
  editorElement: Readonly<Ref<HTMLElement | null>>,
  options: {
    variables: Variable[];
    singleLine?: boolean;
    readOnly?: boolean;
    placeholder: string;
    initialText: string;
  },
) {
  const content = shallowRef('');
  // readOnly 只是初始态：enable() 之后仍可恢复编辑，这里用一个 ref 记录当前是否可编辑，供按钮切换文案。
  const readOnly = ref(options.readOnly === true);
  let editor: EditorInstance | null = null;

  // setText 会同步触发 onChange；挂载后再写入一次，保证输出框显示初始内容。
  onMounted(() => {
    if (!editorElement.value) return;
    editor = createEditor({
      element: editorElement.value,
      placeholder: options.placeholder,
      maxLength: 200,
      ...(options.singleLine ? { singleLine: true } : {}),
      ...(options.readOnly ? { readOnly: true } : {}),
      variables: options.variables,
      onChange(instance) {
        content.value = instance.getText();
      },
    });
    editor.setText(options.initialText);
    content.value = editor.getText();
  });

  onBeforeUnmount(() => editor?.destroy());

  return {
    content,
    readOnly,
    insert(token: string) {
      editor?.insertVariable(token);
    },
    toggleReadOnly() {
      if (!editor) return;
      if (readOnly.value) editor.enable();
      else editor.disable();
      readOnly.value = !readOnly.value;
    },
  };
}

const singleLineElement = useTemplateRef<HTMLElement>('singleLineElement');
const richTextElement = useTemplateRef<HTMLElement>('richTextElement');
const readOnlyElement = useTemplateRef<HTMLElement>('readOnlyElement');

// 单行模式演示 {{}} 风格的 token。
const singleLineDemo = useDemo(singleLineElement, {
  singleLine: true,
  placeholder: '单行输入',
  variables: [
    { token: '{{username}}', label: '#客户姓名#' },
    { token: '{{phone}}', label: '#客户电话#' },
  ],
  initialText: '您好，{{username}}，电话 {{phone}}',
});

// 普通模式演示 ## 风格的 token。
const richTextDemo = useDemo(richTextElement, {
  placeholder: '请输入内容',
  variables: [
    { token: '#username#', label: '#姓名#' },
    { token: '#phone#', label: '#电话#' },
  ],
  initialText: '您好，#username#。\n这是一段可以换行的多行文本。',
});

const { content: singleLineContent } = singleLineDemo;
const { content: richTextContent } = richTextDemo;

// 只读模式演示 readOnly 选项：创建即只读，但 enable() 后仍可恢复编辑。
const readOnlyDemo = useDemo(readOnlyElement, {
  readOnly: true,
  placeholder: '只读展示',
  variables: [
    { token: '{{username}}', label: '#客户姓名#' },
    { token: '{{phone}}', label: '#客户电话#' },
  ],
  initialText: '您好，{{username}}，电话 {{phone}}',
});
const { content: readOnlyContent, readOnly: readOnlyEditable, toggleReadOnly } = readOnlyDemo;
</script>

<template>
  <main class="demo-page">
    <h1 class="demo-title">quill-variable-kit</h1>

    <div class="demo-grid">
      <section class="demo-card">
        <h2 class="demo-card-title">普通模式</h2>
        <div ref="richTextElement" class="editor-host" />
        <div class="insert-actions">
          <button class="insert-button" type="button" @click="richTextDemo.insert('#username#')">
            插入客户姓名
          </button>
          <button class="insert-button" type="button" @click="richTextDemo.insert('#phone#')">
            插入客户电话
          </button>
        </div>
        <output class="editor-output">{{ richTextContent }}</output>
      </section>

      <section class="demo-card">
        <h2 class="demo-card-title">单行模式</h2>
        <div ref="singleLineElement" class="editor-host editor-host--single-line" />
        <div class="insert-actions">
          <button
            class="insert-button"
            type="button"
            @click="singleLineDemo.insert('{{username}}')"
          >
            插入客户姓名
          </button>
          <button class="insert-button" type="button" @click="singleLineDemo.insert('{{phone}}')">
            插入客户电话
          </button>
        </div>
        <output class="editor-output">{{ singleLineContent }}</output>
      </section>

      <section class="demo-card">
        <h2 class="demo-card-title">只读模式</h2>
        <div ref="readOnlyElement" class="editor-host" />
        <div class="insert-actions">
          <button class="insert-button" type="button" @click="toggleReadOnly()">
            {{ readOnlyEditable ? '启用编辑' : '恢复只读' }}
          </button>
        </div>
        <p class="editor-hint">
          创建时设 <code>readOnly: true</code> 即为只读；点击按钮调用 <code>enable()</code> /
          <code>disable()</code> 可随时切换编辑态。
        </p>
        <output class="editor-output">{{ readOnlyContent }}</output>
      </section>
    </div>
  </main>
</template>

<style scoped>
.demo-page {
  max-width: 880px;
  margin: 48px auto;
  font: 14px/1.5 sans-serif;
}
.demo-title {
  margin-bottom: 24px;
}
.demo-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
}
.demo-card {
  display: flex;
  flex-direction: column;
}
.demo-card-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.editor-host {
  min-height: 100px;
  width: 500px;
}
/* 单行模式由内容决定高度，不需要多行编辑区的最小高度。 */
.editor-host--single-line {
  min-height: 0;
}
.insert-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.editor-hint {
  margin: 12px 0 0;
  color: #666;
}
.editor-hint code {
  font-family: monospace;
}
.editor-output {
  display: block;
  margin-top: 12px;
  white-space: pre-wrap;
}
</style>
