// やり取りのタブに出す名前。**並びの位置ではなく、やり取りの中身から作る**ので、やり取りが
// 1つ進んでも前からあるタブの名前は変わらない（相対の位置は `turn-tabs.tsx` が別に添える）。
//
// 出どころは**依頼の1行目を先に**使う。依頼はやり取りの始まりと同時に届くので、レポートが
// まだ1つも無い（走っている最中の）やり取りでも名前が付き、あとからレポートが届いても名前が
// 入れ替わらない。依頼が無い・文面が空（画像だけ）のときだけ、最初のレポートの先頭行へ下りる。

import { type MainViewTurn } from "../../../../shared/main-view.ts"

/** タブ1つぶん。`label` は切った名前、`fullLabel` は切る前の1行（`title` で読ませる）。 */
export type TurnTab = {
  readonly id: number
  readonly label: string
  readonly fullLabel: string
}

// タブの名前の長さの上限（文字数）。タブは最大 `MAX_MAIN_VIEW_TURNS` 個が横に並ぶので、
// 畳んだ中間レポートの見出し（1行を独り占めする。40字）より短く抑える。
const MAX_TURN_TAB_LABEL_LENGTH = 14

/** 依頼もレポートも名前にならないやり取り（依頼より前の記録で、本文もまだ無い）の名前。 */
const TURN_TAB_LABEL_FALLBACK = "（依頼なし）"

export function turnTab(turn: MainViewTurn): TurnTab {
  const fullLabel =
    firstLineOf(turn.request?.text ?? "") ?? firstReportLine(turn) ?? TURN_TAB_LABEL_FALLBACK
  return { id: turn.id, label: truncateLabel(fullLabel), fullLabel }
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

/** 空でない最初の行。行の中の空白の並びは1つに詰める（タブの中で折り返さないため）。 */
function firstLineOf(text: string): string | undefined {
  return text
    .split("\n")
    .map((raw) => raw.replace(/\s+/g, " ").trim())
    .find((trimmed) => trimmed !== "")
}

/** 文字（コードポイント）で数えて切る。UTF-16 の単位で切ると絵文字が半分に割れる。 */
function truncateLabel(text: string): string {
  const chars = Array.from(text)
  return chars.length <= MAX_TURN_TAB_LABEL_LENGTH
    ? text
    : `${chars.slice(0, MAX_TURN_TAB_LABEL_LENGTH).join("")}…`
}
