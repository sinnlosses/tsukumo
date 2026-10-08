// やり取りの列の行に出す題と、依頼の塊に出す依頼の行。
// 並びの位置ではなく、ターンの中身から作るので、ターンが1つ進んでも前からあるやり取りの題は変わらない。
//
// 題の出どころは依頼の1行目を先に使う。
// 依頼はターンの始まりと同時に届くので、レポートがまだ1つも無い（走っている最中の）ターンでも題が付き、あとからレポートが届いても入れ替わらない。
// 依頼が無い・文面が空（画像だけ）のときだけ、最初のレポートの先頭行へ下りる。
//
// 題は長さでは切らない。1行に収まらないぶんは CSS が省略する。

import type {
  MainViewRequest,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view.ts"
import { clipText } from "../../../../../../../shared/utils/clip-text.ts"

/** 依頼もレポートも題にならないターン（依頼より前の記録で、本文もまだ無い）の題。 */
const TURN_TITLE_FALLBACK = "（依頼なし）"

export function turnTitle(turn: MainViewTurn): string {
  return (
    firstLineOf(withoutQuoteMarkers(turn.request?.text ?? "")) ??
    firstReportLine(turn) ??
    TURN_TITLE_FALLBACK
  )
}

/**
 * 依頼の塊に出す、依頼の全文の行。
 * 行頭の引用の記号と前後の空行は落とし、字下げは残す。
 * 画像だけの依頼では空の配列。
 */
export function turnRequestLines(request: MainViewRequest): readonly string[] {
  const lines = withoutQuoteMarkers(truncateRequestText(request.text)).split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  const last = lines.findLastIndex((line) => line.trim() !== "")
  return first === -1 ? [] : lines.slice(first, last + 1)
}

// 依頼の塊に出す全文の長さの上限。無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_TEXT_LENGTH = 2000

function truncateRequestText(request: string): string {
  const { head, omittedLength } = clipText(request, MAX_REQUEST_TEXT_LENGTH)
  return omittedLength > 0 ? `${head}…` : head
}

/** 各行の頭の引用の記号（`>` のあとが空白か行末のもの）を、重ねてあっても全部落とす。 */
function withoutQuoteMarkers(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:>(?:[ \t]|$))+/, ""))
    .join("\n")
}

function firstReportLine(turn: MainViewTurn): string | undefined {
  for (const step of turn.steps) {
    if (step.body.kind === "text") {
      const line = firstLineOf(step.body.firstLine)
      if (line !== undefined) {
        return line
      }
    }
  }
  return undefined
}

/**
 * 空でない最初の行。空でない行が無ければ undefined。
 * 行の中の空白の並びは1つに詰める（1行の題の中で折り返させないため）。
 */
function firstLineOf(text: string): string | undefined {
  return text
    .split("\n")
    .map((raw) => raw.replace(/\s+/g, " ").trim())
    .find((trimmed) => trimmed !== "")
}
