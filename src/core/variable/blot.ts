import Quill, { Parchment } from 'quill';
import type { Variable } from '../../types';

// Parchment 由 quill 重新导出，且运行时是同一个对象（`Parchment.EmbedBlot === (await import('parchment')).EmbedBlot`），
// 所以这里不直接依赖 parchment 包：少一个 peer，也避免宿主装到与 quill 内部不同的 parchment 版本。
// 注意必须用命名导入 `{ Parchment }`——默认导出上并没有 Parchment 属性。
const { EmbedBlot, TextBlot } = Parchment;

/** Parchment 的 Root（ScrollBlot 滚动根）类型。
 * 不直接解构 ScrollBlot：它在这里只出现在类型位置，解构出来会被视为未使用的变量。
 * 从已用到的 TextBlot 的构造参数里取（TextBlot 明明白白声明了 `constructor(scroll: Root, …)`），
 * 既保持"不依赖 parchment 包"的约定，也避开那个未使用变量的告警。 */
type ParchmentScroll = ConstructorParameters<typeof TextBlot>[0];

export const VARIABLE_BLOT_NAME = 'variable';

// iOS Safari 的光标渲染 bug：一行最后一个元素是不可编辑的 contenteditable=false 时，
// 行尾没有再可编辑的锚点给光标落点，iOS Safari 会把光标画到这一行的最右缘（编辑器边缘），
// 而不是紧挨着变量的右边。逻辑光标位置是对的，只是画错位置。
// 解法沿用 quill 自带 formula 那套：在不可编辑岛两侧放 \uFEFF（ZWNBSP）零宽占位符，光标便有了
// 落脚点。占位符必须放在 blot 外层 span 的**内部**、且外层 span 保持可编辑（contenteditable=false
// 只设在内层 contentNode 上），否则占位符同样无处可放。`value()` 只读 dataset，所以占位符不会
// 漏进 Delta 与 getText()；剪贴板 matcher 也按 className 整节点转 Delta，同样不受内层结构影响。
const GUARD_TEXT = '\uFEFF';

/** `restore()` 的返回形状：被敲进占位符里的文本该以什么选区落进文档。 */
interface EmbedContextRange {
  startNode: Node;
  startOffset: number;
  endNode?: Node;
  endOffset?: number;
}

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

  private contentNode!: HTMLElement;
  private leftGuard!: Text;
  private rightGuard!: Text;

  static create(value: Partial<Variable>): HTMLElement {
    const node = super.create() as HTMLElement;
    const { token, label } = normalizeVariable(value);
    node.dataset.token = token;
    node.dataset.label = label;
    // 文本先进外层 span，constructor 会把子节点整体挪进不可编辑的 contentNode。
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

  constructor(scroll: ParchmentScroll, domNode: Node) {
    super(scroll, domNode);
    // 结巴结构：外层 span 可编辑，内层 contentNode 才是不可编辑岛，两侧垫 \uFEFF 占位符。
    // 顺序与 quill 的 blots/embed.js 一致，`index` / `restore` 依赖这个布局。
    this.contentNode = document.createElement('span');
    this.contentNode.setAttribute('contenteditable', 'false');
    Array.from(this.domNode.childNodes).forEach((childNode) => {
      this.contentNode.appendChild(childNode);
    });
    this.leftGuard = document.createTextNode(GUARD_TEXT);
    this.rightGuard = document.createTextNode(GUARD_TEXT);
    this.domNode.appendChild(this.leftGuard);
    this.domNode.appendChild(this.contentNode);
    this.domNode.appendChild(this.rightGuard);
  }

  index(node: Node, offset: number): number {
    if (node === this.leftGuard) return 0;
    if (node === this.rightGuard) return 1;
    return super.index(node, offset);
  }

  /** 光标落进占位符时，把敲进去的字符挪到变量前后的真实文本节点，别让打字污染占位符。 */
  restore(node: Text): EmbedContextRange | null {
    let range: EmbedContextRange | null = null;
    const text = node.data.split(GUARD_TEXT).join('');
    if (node === this.leftGuard) {
      if (this.prev instanceof TextBlot) {
        this.prev.insertAt(this.prev.length(), text);
        range = { startNode: this.prev.domNode, startOffset: this.prev.length() };
      } else {
        const textNode = document.createTextNode(text);
        this.parent.insertBefore(this.scroll.create(textNode), this);
        range = { startNode: textNode, startOffset: text.length };
      }
    } else if (node === this.rightGuard) {
      if (this.next instanceof TextBlot) {
        this.next.insertAt(0, text);
        range = { startNode: this.next.domNode, startOffset: text.length };
      } else {
        const textNode = document.createTextNode(text);
        this.parent.insertBefore(this.scroll.create(textNode), this.next);
        range = { startNode: textNode, startOffset: text.length };
      }
    }
    node.data = GUARD_TEXT;
    return range;
  }

  update(mutations: MutationRecord[], context: Record<string, unknown>): void {
    mutations.forEach((mutation) => {
      if (
        mutation.type === 'characterData' &&
        (mutation.target === this.leftGuard || mutation.target === this.rightGuard)
      ) {
        const range = this.restore(mutation.target as Text);
        if (range) context.range = range;
      }
    });
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
