import Quill from 'quill';
import { registerVariableBlot } from './variable/blot';

/** 仅供内部创建实例使用；导入时完成内置 blot 注册。 */
export class InternalEditor extends Quill {}

registerVariableBlot(InternalEditor);
