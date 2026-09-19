import { Delta } from 'quill';
import type { Variable, VariableUsage } from '../../types';
import { normalizeVariable, VARIABLE_BLOT_NAME } from './blot';

function escapeRegExp(match: string): string {
  return match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 计算文本字数：换行与变量的 `token` 不计入。
 * 与识别规则保持一致——只有 `token` 会被转成变量，`label` 是普通文本，照常计数。
 */
export function getContentLength(text: string, variables: Variable[] = []): number {
  let content = text.replace(/\r\n|\r|\n/g, '');
  variables.forEach((variable) => {
    if (variable.token) content = content.replaceAll(variable.token, '');
  });
  return content.length;
}

/**
 * 展开成匹配串 → 变量配置的映射。
 * 一个变量有两个匹配串：`token`（程序写入）与 `label`（人类粘贴），用哪一个由 `getMatches` 决定。
 */
function buildMatchMap(
  variables: Variable[],
  getMatches: (variable: Variable) => Array<string | undefined>,
): Map<string, Variable> {
  const matchMap = new Map<string, Variable>();
  variables.filter((variable) => Boolean(variable.token)).forEach((variable) => {
    const normalized = normalizeVariable(variable);
    getMatches(variable)
      .filter((match): match is string => Boolean(match))
      .forEach((match) => matchMap.set(match, normalized));
  });
  return matchMap;
}

/** 把普通文本里的匹配串替换成变量嵌入节点；长匹配串优先，避免短匹配串先吃掉前缀。 */
function replaceMatches(delta: Delta, matchMap: Map<string, Variable>): Delta {
  const patterns = [...matchMap.keys()].sort((left, right) => right.length - left.length);
  if (patterns.length === 0) return delta;
  const pattern = new RegExp(patterns.map(escapeRegExp).join('|'), 'g');
  const converted = new Delta();
  delta.ops.forEach((op) => {
    if (typeof op.insert !== 'string') {
      converted.push(op);
      return;
    }
    const text = op.insert;
    pattern.lastIndex = 0;
    const found = Array.from(text.matchAll(pattern));
    if (found.length === 0) {
      converted.push(op);
      return;
    }
    let cursor = 0;
    found.forEach((match) => {
      const index = match.index ?? 0;
      if (index > cursor) converted.insert(text.slice(cursor, index), op.attributes);
      converted.insert({ [VARIABLE_BLOT_NAME]: matchMap.get(match[0]) }, op.attributes);
      cursor = index + match[0].length;
    });
    if (cursor < text.length) converted.insert(text.slice(cursor), op.attributes);
  });
  return converted;
}

/** 按 `token` 匹配：`setText` 与初始文本走这条路径。 */
export function replaceByToken(delta: Delta, variables: Variable[]): Delta {
  return replaceMatches(
    delta,
    buildMatchMap(variables, (variable) => [variable.token]),
  );
}

/**
 * 校验粘贴进来的 embed：token 在目标配置里存在就按**目标**的 label 重建，
 * 不存在就降级成源 label 的**纯文本**，避免把源编辑器的 token 写进本文档。
 *
 * 为什么要重建而不是原样保留：同一个 token 在两处配置里的 label 可能不同，
 * 原样保留会让文档里出现与配置不一致的展示文本。
 * 降级取 label 而不是 token：label 才是给人看的文本，降成 token 会把模板语法
 * （`{{username}}`）暴露到正文里。
 */
export function normalizePastedEmbeds(delta: Delta, variables: Variable[]): Delta {
  const byToken = new Map<string, Variable>();
  variables
    .filter((variable) => Boolean(variable.token))
    .forEach((variable) => byToken.set(variable.token, normalizeVariable(variable)));

  const normalized = new Delta();
  delta.ops.forEach((op) => {
    if (typeof op.insert !== 'string' && op.insert && typeof op.insert === 'object') {
      const value = op.insert[VARIABLE_BLOT_NAME];
      if (value && typeof value === 'object') {
        const { token, label } = normalizeVariable(value as Partial<Variable>);
        const configured = token ? byToken.get(token) : undefined;
        if (configured) {
          normalized.insert({ [VARIABLE_BLOT_NAME]: configured }, op.attributes);
        } else {
          // 未配置的 token：连同它的展示文本一起降级为普通文本，交给后续 label 匹配重新识别。
          normalized.insert(label || token || '', op.attributes);
        }
        return;
      }
    }
    normalized.push(op);
  });
  return normalized;
}

/** 按 `label` 匹配：粘贴纯文本走这条路径。 */
export function replaceByLabel(delta: Delta, variables: Variable[]): Delta {
  return replaceMatches(
    delta,
    buildMatchMap(variables, (variable) => [variable.label || variable.token]),
  );
}

/** 将完整初始文本转为包含变量嵌入节点的 Delta。 */
export function textToVariableDelta(text: string, variables: Variable[] = []): Delta {
  if (!text) return new Delta();
  return replaceByToken(new Delta().insert(text), variables);
}

/** 把 Delta 拍平成展示文本（变量取 label），用于复制 / 剪切导出。 */
export function deltaToLabelText(delta: Delta): string {
  return delta.ops
    .map((op) => {
      if (typeof op.insert === 'string') return op.insert;
      if (!op.insert || typeof op.insert !== 'object') return '';
      const value = op.insert[VARIABLE_BLOT_NAME];
      if (!value || typeof value !== 'object') return '';
      const { token, label } = normalizeVariable(value as Partial<Variable>);
      return label || token || '';
    })
    .join('');
}

/**
 * 按首次出现顺序统计文档里的变量。
 *
 * 必须读 Delta 里的 embed，而不是正则扫描拍平后的 `getText()`：token 之间可能互为子串，
 * 文本匹配会数错，embed 才是权威数据。
 */
export function collectVariableUsage(delta: Delta): VariableUsage[] {
  const byToken = new Map<string, VariableUsage>();
  delta.ops.forEach((op) => {
    if (!op.insert || typeof op.insert !== 'object') return;
    const value = op.insert[VARIABLE_BLOT_NAME];
    if (!value || typeof value !== 'object') return;
    const { token, label } = normalizeVariable(value as Partial<Variable>);
    const existing = byToken.get(token);
    if (existing) existing.count += 1;
    else byToken.set(token, { token, label, count: 1 });
  });
  return [...byToken.values()];
}
