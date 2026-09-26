// ターンの札の頭に出すタイトルと、タイトルに取られた残りの依頼。並びの位置ではなく、ターンの
// 中身から作るので、ターンが1つ進んでも前からある札のタイトルは変わらない（位置は
// `turn-header.tsx` が「n / N」で別に添える）。
//
// 出どころは依頼の1行目を先に使う。依頼はターンの始まりと同時に届くので、レポートが
// まだ1つも無い（走っている最中の）ターンでもタイトルが付き、あとからレポートが届いても
// 入れ替わらない。依頼が無い・文面が空（画像だけ）のときだけ、最初のレポートの先頭行へ下りる。
//
// 長さでは切らない。 1行に収まらないぶんは CSS が省略する（`.turn-title`）。

import { type MainViewTurn } from "../../../../../../../shared/main-view.ts"

/** 依頼もレポートもタイトルにならないターン（依頼より前の記録で、本文もまだ無い）のタイトル。 */
const TURN_TITLE_FALLBACK = "（依頼なし）"

export function turnTitle(turn: MainViewTurn): string {
  return firstLineOf(turn.request?.text ?? "")?.line ?? firstReportLine(turn) ?? TURN_TITLE_FALLBACK
}

// 依頼の全文（`turn.tsx` の `RequestRest` と、下の `turnHistoryText`）の長さの上限。
// 無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_HEADING_TEXT_LENGTH = 2000

export function truncateRequestText(request: string): string {
  return request.length <= MAX_REQUEST_HEADING_TEXT_LENGTH
    ? request
    : `${request.slice(0, MAX_REQUEST_HEADING_TEXT_LENGTH)}…`
}

/**
 * 窓の中のやり取りの一覧（`turn-header.tsx` の `TurnHistoryList`）の行に出す、依頼の全文。
 * `turnTitle` と違って改行や空白を詰めない——行の中で選択してコピーしたときに、2行目以降
 * まで含めた依頼そのものが入るようにするため。依頼が無いターンは `turnTitle` と同じ表示にする。
 */
export function turnHistoryText(turn: MainViewTurn): string {
  return turn.request !== undefined ? truncateRequestText(turn.request.text) : turnTitle(turn)
}

/**
 * 依頼の文面のうち、タイトルに取られた行（最初の空でない行）より後ろの行。タイトルと同じ行を
 * 二度出さないために、札の本文側（`turn.tsx` の `RequestRest`）はこちらだけを出す。
 * 前後の空行は落とし、残りが無ければ空の配列。
 */
export function requestLinesAfterTitle(text: string): readonly string[] {
  const found = firstLineOf(text)
  if (found === undefined) {
    return []
  }
  const rest = text.split("\n").slice(found.lineIndex + 1)
  const first = rest.findIndex((line) => line.trim() !== "")
  const last = rest.findLastIndex((line) => line.trim() !== "")
  return first === -1 ? [] : rest.slice(first, last + 1)
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
 * 空でない最初の行と、その行番号。行の中の空白の並びは1つに詰める（1行のタイトルの中で
 * 折り返させないため）。空でない行が無ければ undefined。
 */
function firstLineOf(
  text: string,
): { readonly line: string; readonly lineIndex: number } | undefined {
  const lines = text.split("\n").map((raw) => raw.replace(/\s+/g, " ").trim())
  const lineIndex = lines.findIndex((trimmed) => trimmed !== "")
  const line = lines[lineIndex]
  return line === undefined ? undefined : { line, lineIndex }
}
