// コメントの行を見分ける規約のテストの共有部品。

export function withoutComments(content: string): string {
  const lines = content.split("\n")
  const comments = new Set(commentLineIndexes(lines))
  return lines.filter((_, index) => !comments.has(index)).join("\n")
}

/**
 * 行頭が `//` の行と、行頭が `/*` の行から `*\/` を含む行までの行番号を返す。
 * 行の途中で開くブロックコメントは拾わない（取りこぼしても検査が緩むだけで、誤検出はしない）。
 */
export function commentLineIndexes(lines: ReadonlyArray<string>): ReadonlyArray<number> {
  return lines.reduce<{ readonly inBlock: boolean; readonly indexes: ReadonlyArray<number> }>(
    ({ inBlock, indexes }, line, index) => {
      const opens = !inBlock && /^\s*\/\*/.test(line)
      const isComment = inBlock || opens || /^\s*\/\//.test(line)
      const closes = (inBlock || opens) && line.includes("*/")
      return {
        inBlock: (inBlock || opens) && !closes,
        indexes: isComment ? [...indexes, index] : indexes,
      }
    },
    { inBlock: false, indexes: [] },
  ).indexes
}
