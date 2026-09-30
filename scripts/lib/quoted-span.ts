// Bash のコマンド文字列から、引用符と heredoc が占める範囲を拾う。
// PreToolUse hook が、データとして書かれただけの語を判定から外すために使う。

/** コマンド文字列の中で、引用符（`'...'`・`"..."`）または heredoc が占める範囲。 */
export type QuotedSpan = {
  readonly start: number
  readonly end: number
  readonly content: string
  readonly kind: "quote" | "heredoc"
}

/** 引用符・heredoc の範囲を、それぞれ空白1つへ置き換えたコマンド。 */
export function withSpansBlanked(command: string, spans: readonly QuotedSpan[]): string {
  let result = command
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    result = `${result.slice(0, span.start)} ${result.slice(span.end)}`
  }
  return result
}

/** コマンド文字列から、単一引用符・二重引用符・heredoc の範囲をすべて拾う。形が崩れているものはスキップする。 */
export function findQuotedSpans(command: string): readonly QuotedSpan[] {
  const spans: QuotedSpan[] = []
  let index = 0
  while (index < command.length) {
    const quoteSpan = readQuoteSpan(command, index)
    if (quoteSpan !== undefined) {
      spans.push(quoteSpan)
      index = quoteSpan.end
      continue
    }

    const heredocSpan = readHeredocSpan(command, index)
    if (heredocSpan !== undefined) {
      spans.push(heredocSpan)
      index = heredocSpan.end
      continue
    }

    index += 1
  }
  return spans
}

function readQuoteSpan(command: string, start: number): QuotedSpan | undefined {
  const quote = command[start]
  if (quote !== "'" && quote !== '"') {
    return undefined
  }

  let index = start + 1
  while (index < command.length) {
    if (quote === '"' && command[index] === "\\") {
      index += 2
      continue
    }
    if (command[index] === quote) {
      index += 1
      break
    }
    index += 1
  }
  return {
    start,
    end: index,
    content: command.slice(start + 1, Math.max(start + 1, index - 1)),
    kind: "quote",
  }
}

function readHeredocSpan(command: string, start: number): QuotedSpan | undefined {
  const marker = /^<<(-|~)?\s*(?:'(\w+)'|"(\w+)"|(\w+))/.exec(command.slice(start))
  if (marker === null) {
    return undefined
  }

  const stripsIndent = marker[1] === "-"
  const delimiter = marker[2] ?? marker[3] ?? marker[4]
  if (delimiter === undefined) {
    return undefined
  }

  const introLineEnd = command.indexOf("\n", start + marker[0].length)
  if (introLineEnd === -1) {
    return undefined
  }

  const bodyStart = introLineEnd + 1
  const terminator = new RegExp(
    `(^|\\n)${stripsIndent ? "\\t*" : ""}${escapeRegex(delimiter)}(?=\\n|$)`,
  ).exec(command.slice(bodyStart))
  if (terminator === null) {
    return undefined
  }

  return {
    start,
    end: bodyStart + terminator.index + terminator[0].length,
    content: command.slice(bodyStart, bodyStart + terminator.index),
    kind: "heredoc",
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
