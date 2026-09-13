// 書きかけの本文を、**空行を境にした塊へ割る**（`docs/design.md` 6.3）。呼び出し側
// （`src/ui/main-view/report.tsx`）が塊ごとに `Markdown` を独立して描き、変わらない塊は
// `React.memo` で描き直さない。ここは純粋関数だけを置く（React を import しない）。

/**
 * **フェンス付きコードブロックの中の空行では割らない。** 閉じていないフェンス（発話が
 * 途中で切れた等）は最後の塊の中に閉じるので、続きの行が表や見出しに化けない
 * （テスト観点9）。
 */
export function splitReportBlocks(markdown: string): readonly string[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n")
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false

  for (const line of lines) {
    if (isFenceDelimiterLine(line)) {
      inFence = !inFence
    }

    if (line.trim() === "" && !inFence) {
      if (current.length > 0) {
        blocks.push(current.join("\n"))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"))
  }

  return blocks
}

function isFenceDelimiterLine(line: string): boolean {
  return /^ {0,3}(`{3,}|~{3,})/.test(line)
}
