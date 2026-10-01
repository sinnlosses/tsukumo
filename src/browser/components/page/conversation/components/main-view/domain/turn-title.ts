// ターンの札の頭に出すタイトルと、タイトルに取られた残りの依頼。
// 並びの位置ではなく、ターンの中身から作るので、ターンが1つ進んでも前からある札のタイトルは変わらない。
//
// 出どころは依頼の1行目を先に使う。
// 依頼はターンの始まりと同時に届くので、レポートがまだ1つも無い（走っている最中の）ターンでもタイトルが付き、あとからレポートが届いても入れ替わらない。
// 依頼が無い・文面が空（画像だけ）のときだけ、最初のレポートの先頭行へ下りる。
//
// 長さでは切らない。1行に収まらないぶんは CSS が省略する（`.turn-title`）。

import type { MainViewTurn } from "../../../../../../../shared/session/main-view.ts"

/** 依頼もレポートもタイトルにならないターン（依頼より前の記録で、本文もまだ無い）のタイトル。 */
const TURN_TITLE_FALLBACK = "（依頼なし）"

export function turnTitle(turn: MainViewTurn): string {
  return (
    firstLineOf(withoutQuoteMarkers(turn.request?.text ?? ""))?.line ??
    firstReportLine(turn) ??
    TURN_TITLE_FALLBACK
  )
}

/**
 * 窓の中のやり取りの一覧（`TurnHistoryList`）の行に出す、依頼の全文。
 * `turnTitle` と違って改行や空白を詰めない（行の中で選択してコピーしたときに、2行目以降まで含めた依頼そのものが入るようにするため）。
 * 依頼が無いターンは `turnTitle` と同じ表示にする。
 */
export function turnHistoryText(turn: MainViewTurn): string {
  return turn.request !== undefined ? truncateRequestText(turn.request.text) : turnTitle(turn)
}

/**
 * 札の頭のタイトルの下に出す、依頼の続き。
 * 依頼が無い・画像だけのときは空の配列。
 */
export function turnRequestRest(turn: MainViewTurn): readonly string[] {
  return turn.request === undefined
    ? []
    : requestLinesAfterTitle(truncateRequestText(turn.request.text))
}

// 依頼の全文（札の頭の続きと `turnHistoryText`）の長さの上限。無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_HEADING_TEXT_LENGTH = 2000

function truncateRequestText(request: string): string {
  return request.length <= MAX_REQUEST_HEADING_TEXT_LENGTH
    ? request
    : `${request.slice(0, MAX_REQUEST_HEADING_TEXT_LENGTH)}…`
}

/**
 * 依頼の文面のうち、タイトルに取られた行（最初の空でない行）より後ろの行。
 * 行頭の引用の記号は落とす（タイトルと同じ）。
 * 前後の空行は落とし、残りが無ければ空の配列。
 */
function requestLinesAfterTitle(text: string): readonly string[] {
  const unquoted = withoutQuoteMarkers(text)
  const found = firstLineOf(unquoted)
  if (found === undefined) {
    return []
  }
  const rest = unquoted.split("\n").slice(found.lineIndex + 1)
  const first = rest.findIndex((line) => line.trim() !== "")
  const last = rest.findLastIndex((line) => line.trim() !== "")
  return first === -1 ? [] : rest.slice(first, last + 1)
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
      const line = firstLineOf(step.body.firstLine)?.line
      if (line !== undefined) {
        return line
      }
    }
  }
  return undefined
}

/**
 * 空でない最初の行と、その行番号。空でない行が無ければ undefined。
 * 行の中の空白の並びは1つに詰める（1行のタイトルの中で折り返させないため）。
 */
function firstLineOf(
  text: string,
): { readonly line: string; readonly lineIndex: number } | undefined {
  const lines = text.split("\n").map((raw) => raw.replace(/\s+/g, " ").trim())
  const lineIndex = lines.findIndex((trimmed) => trimmed !== "")
  const line = lines[lineIndex]
  return line === undefined ? undefined : { line, lineIndex }
}
