/**
 * 状態の語（上ほど強い）。
 * `background` はターンは終わっているがバックグラウンドタスクが動いているとき。
 * `diary` は成果の日記書きで日記を書いているとき（`state.diaryWriting.kind === "writing"`）。
 * 会話のターンと並んで書いているので作業中より弱い（作業中が動いていれば作業中を出す）。
 */
export type CurrentWorkState = "stopped" | "pending" | "running" | "diary" | "background" | "idle"

/** 状態の語。 */
export const WORK_WORD_LABEL = {
  stopped: "止まっている",
  pending: "答え待ち",
  running: "作業中",
  diary: "振り返り中",
  background: "背景で作業中",
  idle: "依頼待ち",
} satisfies Record<CurrentWorkState, string>

/** 帯の戻り先の点の色の種類。CSS で塗れる少ない値に畳む。 */
export type WorkTone = "idle" | "working" | "pending" | "stopped"

export function workToneOf(state: CurrentWorkState): WorkTone {
  switch (state) {
    case "idle":
      return "idle"
    case "running":
    case "diary":
    case "background":
      return "working"
    case "pending":
      return "pending"
    case "stopped":
      return "stopped"
  }
}
