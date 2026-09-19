import 'quill/dist/quill.core.css';
import './style.css';
// 仅携带 `*.css` 的 ambient 模块声明，让发布出来的 index.d.ts 自包含，见 css-modules.ts。
import './css-modules';

export { createEditor } from './core/create';
export type { EditorInstance, EditorOptions, Variable, VariableUsage } from './types';
