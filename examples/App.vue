<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, type Ref } from "vue";
import { createEditor, type EditorInstance, type Variable } from "../src";

function useDemo(
	editorElement: Readonly<Ref<HTMLElement | null>>,
	options: {
		variables: Variable[];
		singleLine?: boolean;
		placeholder: string;
		initialText: string;
	},
) {
	const content = shallowRef("");
	let editor: EditorInstance | null = null;

	// setText 会同步触发 onChange；挂载后再写入一次，保证输出框显示初始内容。
	onMounted(() => {
		if (!editorElement.value) return;
		editor = createEditor({
			element: editorElement.value,
			placeholder: options.placeholder,
			maxLength: 200,
			...(options.singleLine ? { singleLine: true } : {}),
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
		insert(token: string) {
			editor?.insertVariable(token);
		},
	};
}

const singleLineElement = useTemplateRef<HTMLElement>("singleLineElement");
const richTextElement = useTemplateRef<HTMLElement>("richTextElement");

// 单行模式演示 {{}} 风格的 token。
const singleLineDemo = useDemo(singleLineElement, {
	singleLine: true,
	placeholder: "单行输入",
	variables: [
		{ token: "{{username}}", label: "#客户姓名#" },
		{ token: "{{phone}}", label: "#客户电话#" },
	],
	initialText: "您好，{{username}}，电话 {{phone}}",
});

// 普通模式演示 ## 风格的 token。
const richTextDemo = useDemo(richTextElement, {
	placeholder: "请输入内容",
	variables: [
		{ token: "#username#", label: "#姓名#" },
		{ token: "#phone#", label: "#电话#" },
	],
	initialText: "您好，#username#。\n这是一段可以换行的多行文本。",
});

const { content: singleLineContent } = singleLineDemo;
const { content: richTextContent } = richTextDemo;
</script>

<template>
	<main class="demo-page">
		<h1 class="demo-title">quill-variable-kit</h1>

		<div class="demo-grid">
			<section class="demo-card">
				<h2 class="demo-card-title">普通模式</h2>
				<div ref="richTextElement" class="editor-host" />
				<div class="insert-actions">
					<button
						class="insert-button"
						type="button"
						@click="richTextDemo.insert('#username#')"
					>
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
.editor-output {
	display: block;
	margin-top: 12px;
	white-space: pre-wrap;
}
</style>
