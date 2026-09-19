const PREFIX = '[quill-variable-kit]';

/**
 * 统一的开发期警告出口。
 * 格式对齐 `[Vue warn]`：先给问题，再给可执行的修正建议。
 */
export function warn(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

/** 拼接 token 列表；空列表时给出可读占位，避免出现空白的「已配置：」。 */
export function formatTokens(tokens: string[]): string {
  return tokens.length > 0 ? tokens.map((token) => `"${token}"`).join('、') : '（未配置任何变量）';
}
