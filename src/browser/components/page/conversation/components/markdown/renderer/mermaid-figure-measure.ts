// mermaid の図を置く幅の段の選び方と、横に流れる flowchart を縦に置き換えるソースの作り方。

export type FigureMeasure = "body" | "wide" | "full"

/** 図の文字（CSS px）の下限。 */
const MIN_TEXT_PX = 12

const MEASURES = ["body", "wide", "full"] as const satisfies readonly FigureMeasure[]

const LEFT_TO_RIGHT_HEAD = /^(\s*(?:flowchart|graph)\s+)LR(\s*;?\s*)$/

/**
 * 狭い段から順に、図の文字が下限以上になる最初の段を返す。どの段も下回れば `undefined`。
 * 段を当てて測るのは呼ぶ側なので、`textPxAt` は必要になった段でだけ呼ぶ。
 */
export function pickMeasure(
  textPxAt: (measure: FigureMeasure) => number,
): FigureMeasure | undefined {
  return MEASURES.find((measure) => textPxAt(measure) >= MIN_TEXT_PX)
}

/** 先頭行が `flowchart LR` か `graph LR` のときだけ、先頭行の `LR` を `TD` にしたソースを返す。 */
export function topDownSource(code: string): string | undefined {
  const lineEnd = code.indexOf("\n")
  const head = lineEnd === -1 ? code : code.slice(0, lineEnd)
  const rest = lineEnd === -1 ? "" : code.slice(lineEnd)
  const match = LEFT_TO_RIGHT_HEAD.exec(head)
  return match === null ? undefined : `${match[1] ?? ""}TD${match[2] ?? ""}${rest}`
}
