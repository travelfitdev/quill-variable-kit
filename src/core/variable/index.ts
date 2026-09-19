import './style.css';

import Quill, { Delta } from 'quill';
import type { Variable, VariableUsage } from '../../types';
import { formatTokens, warn } from '../warn';
import { normalizeVariable, VARIABLE_BLOT_NAME } from './blot';
import {
  collectVariableUsage,
  deltaToLabelText,
  getContentLength,
  normalizePastedEmbeds,
  replaceByLabel,
  replaceByToken,
} from './tokens';

interface CopyRange {
  index: number;
  length: number;
}

interface ClipboardInstance {
  onCopy(range: CopyRange, isCut?: boolean): { html: string; text: string };
}

/**
 * 变量能力与某个 Quill 实例的绑定：blot（见 `./blot`）负责存储，
 * 这里负责识别、计数、插入、读取与复制导出。
 * 它是 core 能力而不是可插拔扩展——`EditorFacade` 直接 new 出来持有并调用，
 * 未配置 variables 时 facade 拿到 null，不会有任何变量行为。
 */
export class VariableBinding {
  private readonly quill: Quill;
  private readonly variables: Variable[];
  private readonly cleanupSelection: () => void;
  private hasSelection = false;

  constructor(quill: Quill, variables: Variable[]) {
    this.quill = quill;
    this.variables = variables;
    this.warnDuplicatedMatches();
    this.cleanupSelection = this.trackSelection();
    this.patchCopyExport();
  }

  /**
   * 配置期校验：`token` 与 `label` 都参与匹配，重复时匹配表会让后来者静默覆盖先者，
   * 症状是"某个变量插不进去 / 粘贴不识别"，很难排查，所以在这里提前点名。
   */
  private warnDuplicatedMatches(): void {
    const seenTokens = new Set<string>();
    const seenLabels = new Set<string>();
    const duplicates: string[] = [];
    this.variables.forEach((variable) => {
      if (!variable.token) return;
      if (seenTokens.has(variable.token)) duplicates.push(`token "${variable.token}"`);
      seenTokens.add(variable.token);
      const { label } = normalizeVariable(variable);
      if (seenLabels.has(label)) duplicates.push(`label "${label}"`);
      seenLabels.add(label);
    });
    if (duplicates.length === 0) return;
    warn(
      `variables 中存在重复的匹配串：${duplicates.join('、')}\n` +
        '  同一条匹配串只有最后一项会生效，请调整配置。',
    );
  }

  private trackSelection(): () => void {
    const handler = (range: { index: number; length: number } | null): void => {
      if (range) this.hasSelection = true;
    };
    this.quill.on(Quill.events.SELECTION_CHANGE, handler);
    return () => this.quill.off(Quill.events.SELECTION_CHANGE, handler);
  }

  /** 复制 / 剪切导出统一用 label，粘贴时再按 label 还原，保证往返不丢展示文本。 */
  private patchCopyExport(): void {
    const clipboard = this.quill.getModule('clipboard') as ClipboardInstance;
    const originalOnCopy = clipboard.onCopy.bind(clipboard);
    clipboard.onCopy = (range, isCut) => ({
      ...originalOnCopy(range, isCut),
      text: deltaToLabelText(this.quill.getContents(range.index, range.length)),
    });
  }

  /**
   * 粘贴管线的变量阶段：先校验 embed，再按 label 匹配。
   *
   * 顺序是必须的——`normalizePastedEmbeds` 会把未配置的源 token 降级成源 label 的纯文本，
   * 这些文本必须**紧接着**参与 label 匹配，才能在目标编辑器里被重新识别成它自己的变量。
   * 反过来（先匹配后降级）降级产物就永远得不到识别机会。
   */
  transformPastedDelta(delta: Delta): Delta {
    return replaceByLabel(normalizePastedEmbeds(delta, this.variables), this.variables);
  }

  transformInsertedText(delta: Delta): Delta {
    return replaceByToken(delta, this.variables);
  }

  measureText(text: string): number {
    return getContentLength(text, this.variables);
  }

  getVariables(): VariableUsage[] {
    return collectVariableUsage(this.quill.getContents());
  }

  insertVariable(token: string): void {
    const { quill } = this;
    if (!token) return;
    // 只允许插入已配置的变量，避免写入编辑器无法展示与识别的孤儿 token。
    const configured = this.variables.find((item) => item.token === token);
    if (!configured) {
      warn(
        `insertVariable 收到未配置的 token：${token}\n` +
          `  可用的 token：${formatTokens(this.variables.map((item) => item.token))}\n` +
          '  该调用已被忽略，请在 variables 中配置该 token。',
      );
      return;
    }
    const range = this.hasSelection
      ? quill.getSelection(true)
      : { index: Math.max(0, quill.getLength() - 1), length: 0 };
    if (!range) return;
    if (range.length > 0) quill.deleteText(range.index, range.length, Quill.sources.USER);
    quill.insertEmbed(
      range.index,
      VARIABLE_BLOT_NAME,
      // 展示文本只来自配置，保证插入结果与 setText 等路径一致。
      normalizeVariable(configured),
      Quill.sources.USER,
    );
    quill.setSelection(range.index + 1, 0, Quill.sources.SILENT);
    // setSelection 用 SILENT 是为了不抢焦点（也避免把 hasSelection 置真），代价是 Quill 会连自动滚动
    // 一起跳过；单行模式下内容横向溢出，插入点在视野外时必须显式滚动（Quill 的粘贴路径也这么做）。
    quill.scrollSelectionIntoView();
  }

  destroy(): void {
    this.cleanupSelection();
  }
}
