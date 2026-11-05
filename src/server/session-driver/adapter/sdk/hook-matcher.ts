import { escapeRegExp } from "../../../../shared/utils/escape-regexp.ts"

/**
 * 指定した名前の完全一致と、指定した頭の名前を除くツールに当たる PreToolUse の matcher を作る。
 * Claude Code は英数字・`_`・`|`・`,`・空白・`-` だけの matcher を名前の完全一致として、
 * それ以外を正規表現として名前に当てる（正規表現として不正なら当てない）。ここでは後者の形を返す。
 */
export function matcherExcluding(names: readonly string[], prefix: string): string {
  return `^(?!(?:${names.map(escapeRegExp).join("|")})$)(?!${escapeRegExp(prefix)})`
}
